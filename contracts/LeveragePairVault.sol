// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

pragma abicoder v2;

/**
errorCode       message
   0       close or not support
   1       price abnormal
   2       too much debt
   3       only LendVault Address
   4       share equal to zero!
   5       zero address
   6       pool already exists!
   7       invalid params
   8       wrong id
   9       price abnormal
   10      not position owner
   11      closed position
   12      health position
   13      only hunter
  **/

import "../interfaces/ILendVault.sol";
import "../interfaces/IProjectConfig.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IUniversePairVault.sol";

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract LeveragePairVault is Ownable {

    using SafeERC20 for IERC20;
    using SafeERC20 for IUniversePairVault;
    using SafeMath for uint256;

    struct PoolInfo {
        bool isOpen;
        bool canFarm;
        address token0;
        address token1;
        IUniversePairVault vault;
        IERC20 shareToken;
        uint64  maxPriceDiff; //prevent price attack
        uint256 share; //the share of this pool in universe vault
        uint256 openFactor;
        uint256 liquidateFactor;
        uint256 idx;
    }

    /// vault address => poolInfo
    mapping(address => PoolInfo) public pools;
    /// index = > vault address
    mapping(uint256 => address) public poolIndex;
    // index
    uint256 public currentPid;

    struct Position {
        address owner;
        address vaultAddress;
        uint256 debtShare0;
        uint256 debtShare1;
        uint256 share;
    }
    /// index => position
    mapping(uint256 => Position) public positions;
    uint256 public currentPos = 1;

    // Approve Status  token => vault
    mapping(address => mapping(address => bool)) public approveStatus;

    // cache
    uint24 public swapFee;
    address private requestPoolAddress;

    address public devAddress;
    ILendVault public immutable lendVault;
    ISwapRouter public immutable router;
    IQuoterV2 public immutable quoter;
    IProjectConfig configReader;

    constructor(address _lendVault, address _router, address _quoterAddress, address _config, address _dev) {
        lendVault = ILendVault(_lendVault);
        configReader = IProjectConfig(_config);
        router = ISwapRouter(_router);
        quoter = IQuoterV2(_quoterAddress);
        devAddress = _dev;
    }

    /* ========== MODIFIERS ========== */

    modifier onlyLendVault {
        require(msg.sender == address(lendVault), "3");
        _;
    }

    /* ========== OWNER ========== */

    function changeDevAddress(address _dev) external onlyOwner {
        require(_dev != address(0), "5");
        devAddress = _dev;
    }

    function changeConfig(address _config) external onlyOwner {
        require(_config != address(0), "5");
        configReader = IProjectConfig(_config);
    }

    /// @notice Add vault to leverage contract
    /// @dev the vault must be Universe Finance pair vault
    /// @param _maxPriceDiff The max price offset will be allowed
    /// @param _vaultAddress The address of the pair vault
    /// @param _shareAddress The address of the share
    /// @param _openFactor The max Factor be allowed when open position
    /// @param _liquidateFactor The min Factor when liquidate a position
    function addPool(
        uint64 _maxPriceDiff,
        address _vaultAddress,
        address _shareAddress,
        uint256 _openFactor,
        uint256 _liquidateFactor
    ) external onlyOwner {
        require(_openFactor < _liquidateFactor && _liquidateFactor < 10000
            && _maxPriceDiff > 0 && _maxPriceDiff <= 2000, "7");
        PoolInfo memory pool = pools[_vaultAddress];
        require(!pool.isOpen, '6');

        IUniversePairVault vault = IUniversePairVault(_vaultAddress);

        address token0 = address(vault.token0());
        address token1 = address(vault.token1());

        if(_shareAddress != address(0)){
            _tokenApprove(_shareAddress, _vaultAddress);
        }else{
            _tokenApprove(_vaultAddress, _vaultAddress);
        }

        _tokenApprove(token0, _vaultAddress);
        _tokenApprove(token1, _vaultAddress);

        _tokenApprove(token0, address(router));
        _tokenApprove(token1, address(router));

        pool.idx = currentPid;

        poolIndex[currentPid++] = _vaultAddress;

        pool.vault = vault;
        pool.shareToken = IERC20(_shareAddress);
        pool.isOpen = true;
        pool.canFarm = true;
        pool.token0 = token0;
        pool.token1 = token1;
        pool.share = 0;
        pool.openFactor = _openFactor;
        pool.liquidateFactor = _liquidateFactor;
        pool.maxPriceDiff = _maxPriceDiff;

        pools[_vaultAddress] = pool;
    }

    function updatePool(
        bool canFarm,
        uint64 _maxPriceDiff,
        address _vaultAddress,
        uint256 _openFactor,
        uint256 _liquidateFactor
    ) external onlyOwner {
        require(_openFactor < _liquidateFactor && _liquidateFactor < 10000
                && _maxPriceDiff > 0 && _maxPriceDiff <= 2000 , "7");
        PoolInfo storage pool = pools[_vaultAddress];
        require(pool.isOpen, '6');
        pool.canFarm = canFarm;
        pool.openFactor = _openFactor;
        pool.liquidateFactor = _liquidateFactor;
        pool.maxPriceDiff = _maxPriceDiff;
    }

    /* ========== READABLE ========== */

    function lpShareToAmount(address _vaultAddress, uint256 _lpShare) public view returns (uint256, uint256) {
        PoolInfo memory pool = pools[_vaultAddress];
        if (pool.share == 0) {return (0, 0);}

        (uint256 reserve0, uint256 reserve1,,,,) = pool.vault.getTotalAmounts();
        uint256 totalSupply = pool.shareToken.totalSupply();

        uint256 amount0 = _lpShare.mul(reserve0).div(totalSupply);
        uint256 amount1 = _lpShare.mul(reserve1).div(totalSupply);

        return (amount0, amount1);
    }

    function shareToDebt(address tokenAddress, uint256 share) public view returns (uint256) {
        (uint256 debtBal, uint256 debtShare) = lendVault.totalDebt(tokenAddress);
        if (debtShare == 0) return share;
        return share.mul(debtBal).div(debtShare);
    }

    function debtToShare(address tokenAddress, uint256 balance) public view returns (uint256) {
        (uint256 debtBal, uint256 debtShare) = lendVault.totalDebt(tokenAddress);
        if (debtBal == 0) return balance;
        return balance.mul(debtShare).div(debtBal);
    }

    function posHealth(uint256 id) public view returns (uint256) {
        require(id < currentPos, "8");
        Position storage position = positions[id];
        if (position.share == 0) {return 0;}
        PoolInfo storage pool = pools[position.vaultAddress];

        uint256 debt0 = shareToDebt(pool.token0, position.debtShare0);
        uint256 debt1 = shareToDebt(pool.token1, position.debtShare1);

        (uint256 amount0, uint256 amount1) = lpShareToAmount(position.vaultAddress, position.share);

        return calHealth(pool.vault, amount0, amount1, debt0, debt1);

    }

    function calHealth(
        IUniversePairVault _vault,
        uint256 amount0,
        uint256 amount1,
        uint256 debt0,
        uint256 debt1
    )  internal view returns(uint256) {
        if(debt0 == 0 && debt1 == 0){
            return 0;
        }
        (,address _poolAddress,,,,,) = _vault.positionList(0);
        uint256 priceX96 = _priceX96(_poolAddress);

        uint256 userNv = oneTokenAmount(amount0, amount1, priceX96);
        uint256 debtNv = oneTokenAmount(debt0, debt1, priceX96);
        //if priceX96 = 0，userNv = 0,
        if(userNv == 0){
            return uint(-1);
        }else{
            //借贷净值/用户持有净值
            return debtNv.mul(10000).div(userNv);
        }

    }

    /// @dev Return whether the given goblin is stable, presumably not under manipulation.
    function isStable(IUniversePairVault _vault) internal view returns (bool) {
        (,address _poolAddress,,,,,) = _vault.positionList(0);
        PoolInfo memory pool = pools[address(_vault)];
        // 1.get price
        uint256 priceX96 = _priceX96(_poolAddress);
        // 2. get avg price for 20、40、60 seconds ago
        (uint8 second, uint8 num) = configReader.getSecondAgo(_poolAddress);
        uint256 secondsAgoPriceX96 = IPriceOracle(configReader.getOracle()).getPrice(_poolAddress, second, num);
        // 3. set max price diff
        uint256 maxPriceDiff = pool.maxPriceDiff;
        // 4. check price
        if(priceX96 > secondsAgoPriceX96){
            require(priceX96.sub(secondsAgoPriceX96) <= secondsAgoPriceX96.mul(maxPriceDiff).div(10000), "9");
        }else{
            require(secondsAgoPriceX96.sub(priceX96) <= priceX96.mul(maxPriceDiff).div(10000), "9");
        }
        return true;
    }

    /* ========== PURE ========== */

    function oneTokenAmount(uint256 a0, uint256 a1, uint256 priceX96) internal pure returns (uint256) {
        return FullMath.mulDiv(priceX96, a0, FixedPoint96.Q96).add(a1);
    }

    /* ========== INTERNAL ========== */

    function deposit(IUniversePairVault _vault, uint256 amount0, uint256 amount1) internal returns (uint256 share0, uint256 share1) {
        (share0, share1) = _vault.deposit(amount0, amount1, address(this));
        require(share0 > 0 || share1 > 0, "4");
        emit Deposit(msg.sender, share0, share1, amount0, amount1);
    }

    function withdraw(IUniversePairVault _vault, uint256 share) internal {
        //先看有多少ULP
        (uint256 ulpAmount, ) = _vault.getUserShares(address(this));
        if(share > ulpAmount){
            share = ulpAmount;
        }
        _vault.withdraw(share);
        // EVENT
        emit Withdraw(address(this), share);
    }

    function _swap(address tokenIn, address tokenOut, uint256 _amountIn, uint256 _amountOutMinimum) internal {
        // swap params
        ISwapRouter.ExactInputSingleParams memory param;
        param.tokenIn = tokenIn;
        param.tokenOut = tokenOut;
        param.fee = swapFee;
        param.recipient = address(this);
        param.deadline = block.timestamp;
        param.amountIn = _amountIn;
        param.amountOutMinimum = _amountOutMinimum;
        param.sqrtPriceLimitX96 = 0;

        // swap using router
        uint256 amountOut = router.exactInputSingle(param);
        // event
        emit Swap(msg.sender, tokenIn, tokenOut, _amountIn, amountOut);
    }

    function _quoter(address tokenIn, address tokenOut, uint256 _amountOut) internal returns (uint256 _amountIn){
        IQuoterV2.QuoteExactOutputSingleParams memory param;
        param.tokenIn = tokenIn;
        param.tokenOut = tokenOut;
        param.amount = _amountOut;
        param.fee = swapFee;
        bool zeroForOne = param.tokenIn < param.tokenOut;
        param.sqrtPriceLimitX96 = zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1;
        // quoter price
        (_amountIn, , ,) = quoter.quoteExactOutputSingle(param);
    }

    function payLoanEnough(address token, uint256 debtValue) internal returns (uint256, uint256) {
        uint256 tokenBal = IERC20(token).balanceOf(address(this));
        if(debtValue == 0){
            return (tokenBal,  0);
        }
        if(tokenBal >= debtValue){
            IERC20(token).safeTransfer(msg.sender, debtValue);
            return (tokenBal - debtValue,  0);
        }else{
            return (0, debtValue - tokenBal);
        }
    }

    ///use tokenB swap token for pay loan
    function payLoanLack(address token, address tokenB, uint256 restDebt, uint256 balB) public onlyLendVault {
        //先去询价restDebt个token需要多少tokenB
        uint256 swapTokenB =  _quoter(tokenB, token, restDebt);
        if(swapTokenB == 0){
            return;
        }else if(balB < swapTokenB){
            swapTokenB = balB;
            restDebt = 0;
        }
        //去交换，当tokenB的余额也不足于偿还时不校验restDebt, 有多少还多少 TODO 确认
        _swap(tokenB, token, swapTokenB, restDebt);
        IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    function _priceX96(address poolAddress) internal view returns(uint256 priceX96){
        (uint160 sqrtRatioX96, , , , , , ) = IUniswapV3Pool(poolAddress).slot0();
        priceX96 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, FixedPoint96.Q96);
    }

    /* ========== WRITEABLE ========== */

    /// @dev open position
    function openPosition(
        address _vaultAddress,
        uint256 token0Amount,
        uint256 token1Amount,
        uint256 token0Debt,
        uint256 token1Debt
    ) external {
        require(_vaultAddress != address(0), "5");
        require(token0Amount > 0 && token1Amount > 0, "7");
        IUniversePairVault _vault = IUniversePairVault(_vaultAddress);
        PoolInfo memory pool = pools[_vaultAddress];
        require(pool.isOpen && pool.canFarm, "0");
        //check price
        require(isStable(_vault), "1");

        (token0Amount, token1Amount, token0Debt, token1Debt) = repairDepositAmount(_vault, token0Amount, token1Amount, token0Debt, token1Debt);

        uint256 currentFactor = calHealth(_vault, token0Amount.add(token0Debt), token1Amount.add(token1Debt), token0Debt, token1Debt);
        require( currentFactor < pool.openFactor, "2");

        Position memory position = positions[currentPos++];
        position.owner = msg.sender;
        position.vaultAddress = _vaultAddress;

        transferIn(pool, token0Amount, token1Amount);

        if (token0Debt > 0) {
            position.debtShare0 = lendVault.issueLoan(pool.token0, token0Debt, address(this));
        }
        if (token1Debt > 0) {
            position.debtShare1 = lendVault.issueLoan(pool.token1, token1Debt, address(this));
        }

        (uint256 share,) = deposit(_vault, token0Amount.add(token0Debt), token1Amount.add(token1Debt));
        position.share = position.share.add(share);
        pool.share = pool.share.add(share);

        positions[currentPos - 1] = position;
        pools[_vaultAddress] = pool;

        emit OpenPosition(msg.sender, _vaultAddress, token0Amount, token1Amount, token0Debt, token1Debt);

    }

    /// @dev cover position
    function coverPosition(
        uint256 positionId,
        uint256 token0Amount,
        uint256 token1Amount
    ) external {

        // Check Owner Address
        Position memory position = positions[positionId];
        require(position.owner == msg.sender, "10");
        require(position.share > 0, "11");

        // object
        PoolInfo memory pool = pools[position.vaultAddress];
        require(pool.isOpen && pool.canFarm, "0");

        // price check
        require(isStable(pool.vault), "1");

        IUniversePairVault _vault = IUniversePairVault(position.vaultAddress);
        (, token0Amount, token1Amount) = _vault.getBalancedAmount(token0Amount, token1Amount);

        IERC20 token0 = IERC20(pool.token0);
        IERC20 token1 = IERC20(pool.token1);

        // Transfer
        token0.safeTransferFrom(msg.sender, address(this), token0Amount);
        token1.safeTransferFrom(msg.sender, address(this), token1Amount);

        // deposit
        (uint256 ulpAmount,) = deposit(pool.vault, token0Amount, token1Amount);

        positions[positionId].share = position.share.add(ulpAmount);
        pools[position.vaultAddress].share = pool.share.add(ulpAmount);

        emit CoverPosition(msg.sender, position.vaultAddress, token0Amount, token1Amount);
    }

    /// @dev close position
    function _closePosition(Position memory position, uint share) internal {
        PoolInfo memory pool = pools[position.vaultAddress];
        // go to withdraw
        withdraw(pool.vault, share);

        // update pool share
        pools[position.vaultAddress].share = pool.share.sub(position.share);

        // pay back
        if (position.debtShare0 > 0 || position.debtShare1 > 0) {
            updateSwapInfo(pool);
            lendVault.payLoan(pool.token0, pool.token1, position.debtShare0, position.debtShare1);
        }
    }

    /// @dev close position
    function closePosition(uint256 positionId) external {
        // Check Owner Address
        Position memory position = positions[positionId];
        require(position.owner == msg.sender, "10");
        require(position.share > 0, "11");

        PoolInfo memory pool = pools[position.vaultAddress];
        require(isStable(pool.vault), "1");

        IERC20 token0 = IERC20(pool.token0);
        IERC20 token1 = IERC20(pool.token1);
        //close position and pay loan
        _closePosition(position, position.share);

        // pay back to
        uint256 amt0 = token0.balanceOf(address(this));
        uint256 amt1 = token1.balanceOf(address(this));
        if (amt0 > 0) {
            token0.safeTransfer(msg.sender, amt0);
        }
        if (amt1 > 0) {
            token1.safeTransfer(msg.sender, amt1);
        }

        // 将仓位的份额设置为0
        positions[positionId].share = 0;

        emit ClosePosition(msg.sender, positionId);

    }

    function closePositionPre(uint256 positionId) external view returns(uint256 bal0, uint256 bal1){
        // Check Owner Address
        Position memory position = positions[positionId];
        if(position.share == 0){
            return (0,0);
        }

        PoolInfo memory pool = pools[position.vaultAddress];

        (bal0, bal1) = pool.vault.calBalance(position.share);

        uint256 debt0 = lendVault.debtShareToBalance(pool.token0, position.debtShare0);
        uint256 debt1 = lendVault.debtShareToBalance(pool.token1, position.debtShare1);

        //
        if(bal0 >= debt0){
            bal0 = bal0.sub(debt0);
            debt0 = 0;
        }else{
            bal0 = 0;
            debt0 = debt0.sub(bal0);
        }
        if(bal1 >= debt1){
            bal1 = bal1.sub(debt1);
            debt1 = 0;
        }else{
            bal1 = 0;
            debt1 = debt1.sub(bal1);
        }
        //
        if(debt0 == 0 && debt1 == 0){
            return (bal0, bal1);
        }
        //
        if(debt0 > 0 && debt1 > 0){
            return (bal0, bal1);
        }
        (,address poolAddress,,,,,) = pool.vault.positionList(0);
        (,int24 tick,,,,,) = IUniswapV3Pool(poolAddress).slot0();
        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);

        //
        if(debt0 == 0 && debt1 > 0 && bal0 > 0){
            uint256 needBal0 = FullMath.mulDiv(debt1, FixedPoint96.Q96, sqrtPriceX96);
            needBal0 = FullMath.mulDiv(needBal0, FixedPoint96.Q96, sqrtPriceX96);
            if(bal0 >= needBal0){
                bal0 = bal0.sub(needBal0);
            }else{
                bal0 = 0;
            }
        }
        //
        if(debt1 == 0 && debt0 > 0 && bal1 > 0){
            uint256 needBal1 = FullMath.mulDiv(debt0, sqrtPriceX96, FixedPoint96.Q96);
            needBal1 = FullMath.mulDiv(needBal1, sqrtPriceX96, FixedPoint96.Q96);
            if(bal1 >= needBal1){
                bal1 = bal1.sub(needBal1);
            }else{
                bal1 = 0;
            }
        }
    }

    /// @dev liquidate
    function _liquidate(Position memory position) internal {

        PoolInfo memory pool = pools[position.vaultAddress];
        // withdraw
        withdraw(pool.vault, position.share);

        // update pool share
        pools[position.vaultAddress].share = pool.share.sub(position.share);
        updateSwapInfo(pool);
        // payback
        lendVault.liquidate(pool.token0, pool.token1, position.debtShare0, position.debtShare1);

    }

    /// @dev liquidate
    function liquidate(uint256 positionId) external  {
        require(!configReader.onlyHunter() || msg.sender == configReader.hunter(), "13");
        Position memory position = positions[positionId];
        require(position.share > 0, "11");
        PoolInfo memory pool = pools[position.vaultAddress];
        require(posHealth(positionId) >= pool.liquidateFactor, "12");

        require(isStable(pool.vault), "1");

        _liquidate(position);

        IERC20 token0 = IERC20(pool.token0);
        IERC20 token1 = IERC20(pool.token1);
        uint256 liquidateRate = configReader.liquidateBps();
        uint256 amount0 = token0.balanceOf(address(this));
        uint256 amount1 = token1.balanceOf(address(this));

        if (amount0 > 0) {
            token0.safeTransfer(msg.sender, amount0.mul(liquidateRate).div(10000));
            token0.safeTransfer(position.owner, token0.balanceOf(address(this)));
        }
        if (amount1 > 0) {
            token1.safeTransfer(msg.sender, amount1.mul(liquidateRate).div(10000));
            token1.safeTransfer(position.owner, token1.balanceOf(address(this)));
        }

        // update
        positions[positionId].share = 0;

        emit Liquidate(position.owner, positionId);

    }

    // check approve status
    function _tokenApprove(address tokenAddress, address vaultAddress) internal {
        if (!approveStatus[tokenAddress][vaultAddress]) {
            IERC20(tokenAddress).approve(vaultAddress, type(uint256).max);
            approveStatus[tokenAddress][vaultAddress] = true;
        }
    }

    function transferIn(PoolInfo memory pool, uint256 token0Amount, uint256 token1Amount) internal {
        IERC20 token0 = IERC20(pool.token0);
        IERC20 token1 = IERC20(pool.token1);
        if(token0Amount > 0){
            token0.safeTransferFrom(msg.sender, address(this), token0Amount);
        }
        if(token1Amount > 0){
            token1.safeTransferFrom(msg.sender, address(this), token1Amount);
        }
    }

    function repairDepositAmount(
        IUniversePairVault _vault,
        uint256 _token0Amount,
        uint256 _token1Amount,
        uint256 _token0Debt,
        uint256 _token1Debt
    ) internal view returns(uint256, uint256, uint256, uint256){
        (, _token0Amount, _token1Amount) = _vault.getBalancedAmount(_token0Amount, _token1Amount);
        if(_token0Debt == 0 || _token1Debt == 0){
            _token0Debt = 0;
            _token1Debt = 0;
        }else if(_token0Amount.mul(_token1Debt) > _token1Amount.mul(_token0Debt)){
           _token1Debt = FullMath.mulDiv(_token0Debt, _token1Amount, _token0Amount);
        }else if(_token0Amount.mul(_token1Debt) < _token1Amount.mul(_token0Debt)){
           _token0Debt = FullMath.mulDiv(_token1Debt, _token0Amount, _token1Amount);
        }
        return (_token0Amount, _token1Amount, _token0Debt, _token1Debt);
    }

    function updateSwapInfo(PoolInfo memory pool) internal {
        (,requestPoolAddress,,,,,) = pool.vault.positionList(0);
        swapFee = IUniswapV3Pool(requestPoolAddress).fee();
    }

    /* ========== CALLBACK ========== */

    function payLoanCallback(address tokenA, address tokenB, uint256 debtValueA, uint256 debtValueB) external onlyLendVault {
        //够还的直接还，不够还的记账待会再还
        (uint256 balA, uint256 restDebtA) = payLoanEnough(tokenA, debtValueA);
        (uint256 balB, uint256 restDebtB) = payLoanEnough(tokenB, debtValueB);

        if(restDebtA == 0 && restDebtB == 0){
            return;
        }

        if(restDebtA > 0 && restDebtB > 0){
            IERC20(tokenA).safeTransfer(msg.sender, debtValueA - restDebtA);
            IERC20(tokenB).safeTransfer(msg.sender, debtValueB - restDebtB);
            return;
        }
        if(restDebtA == 0 && restDebtB > 0){
            payLoanLack(tokenB, tokenA, restDebtB, balA);
        }
        if(restDebtB == 0 && restDebtA > 0){
            payLoanLack(tokenA, tokenB, restDebtA, balB);
        }
    }

    /* ========== EVENTS ========== */

    event OpenPosition(address indexed owner, address lpAddress, uint256 amount0, uint256 amount1, uint256 debt0, uint256 debt1);
    event CoverPosition(address indexed owner, address lpAddress, uint256 amount0, uint256 amount1);
    event ClosePosition(address indexed owner, uint256 pid);
    event Liquidate(address indexed owner, uint256 pid);

    event Swap(address indexed vault, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    event Deposit(
        address indexed sender,
        uint256 share0,
        uint256 share1,
        uint256 amount0,
        uint256 amount1
    );

    event Withdraw(
        address indexed sender,
        uint256 share
    );

}
