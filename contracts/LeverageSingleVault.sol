// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

pragma abicoder v2;

/**
  code       message
   0       close or not support
   1       price abnormal
   2       too much debt
   3       only LendVault Address
   4       share equal to zero!
   5       zero
   6       token not in vault
   7       pool already exists
   8       invalid params
   9       pool not exists
  **/

import "../interfaces/ILendVault.sol";
import "../interfaces/IProjectConfig.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IUniverseVault.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract LeverageSingleVault is Ownable {

    using SafeERC20 for IERC20;
    using SafeERC20 for IUniverseVault;
    using SafeMath for uint256;

    // vault信息
    struct VaultInfo {
        bool zero; //token0 or token1
        address vaultAddress;  // 金库合约
    }

    // pool信息
    struct PoolInfo {
        bool isOpen;  //是否开启
        bool canFarm;  //能否挖矿
        bool zero;
        address token0Address;
        address token1Address;
        address vaultAddress;  // 金库合约
        uint64  maxPriceDiff; // 允许最大的价格差，防止价格攻击
        uint256 share; //在vault的份额
        uint256 openFactor; // 开仓的负债阈值
        uint256 liquidateFactor; // 清算的负债阈值
        uint256 _idx;
    }
    /// vaultInfo key => poolInfo  金库地址和池子信息对应
    mapping(bytes32 => PoolInfo) public pools;
    /// index = > vault info 序号和金库地址对应
    mapping(uint256 => bytes32) public poolIndex;
    // 当前序号（和金库的映射）
    uint256 public currentPid;

    //仓位信息
    struct Position {
        address owner; //仓位持有人
        bool zero;
        address tokenAddress; //币种地址
        address vaultAddress;  //金库合约地址
        uint256 debtShare; //借贷token的份额
        uint256 share;  // 仓位份额
    }
    /// index => position
    mapping(uint256 => Position) public positions;
    uint256 public currentPos = 1;

    // Approve Status  token => vault
    mapping(address => mapping(address => bool)) public approveStatus;

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
        devAddress = _dev;
    }

    function changeConfig(address _config) external onlyOwner {
        configReader = IProjectConfig(_config);
    }

    function addPool(
        uint64 _maxPriceDiff,
        bool _zero,
        address _vaultAddress,
        uint256 _openFactor,
        uint256 _liquidateFactor
    ) external onlyOwner {
        require(_vaultAddress != address(0), '5');
        require(_openFactor < _liquidateFactor && _liquidateFactor < 10000 && _maxPriceDiff > 0 && _maxPriceDiff < 1000, '8');
        bytes32 key = getKey(_zero, _vaultAddress);
        PoolInfo memory pool = pools[key];
        require(!pool.isOpen, '7');

        IUniverseVault vault = IUniverseVault(_vaultAddress);
        address tokenAddress;
        if(_zero){
            tokenAddress = address(vault.token0());
        }else{
            tokenAddress = address(vault.token1());
        }

        _tokenApprove(tokenAddress, _vaultAddress);
        _tokenApprove(tokenAddress, address(router));

        pool._idx = currentPid;
        poolIndex[currentPid++] = key;

        pool.isOpen = true;
        pool.canFarm = true;
        pool.zero = _zero;
        pool.token0Address = address(vault.token0());
        pool.token1Address = address(vault.token1());
        pool.vaultAddress = _vaultAddress;
        pool.share = 0;
        pool.openFactor = _openFactor;
        pool.liquidateFactor = _liquidateFactor;
        pool.maxPriceDiff = _maxPriceDiff;

        pools[key] = pool;
    }

    function updatePool(
        bool canFarm,
        uint64 _maxPriceDiff,
        bool _zero,
        address _vaultAddress,
        uint256 _openFactor,
        uint256 _liquidateFactor
    ) external onlyOwner {
        require(_vaultAddress != address(0), '5');
        require(_openFactor < _liquidateFactor && _liquidateFactor < 10000 && _maxPriceDiff > 0 && _maxPriceDiff < 1000 , '8');
        bytes32 key = getKey(_zero, _vaultAddress);
        PoolInfo memory pool = pools[key];
        require(pool.isOpen, '9');
        pool.canFarm = canFarm;
        pool.openFactor = _openFactor;
        pool.liquidateFactor = _liquidateFactor;
        pool.maxPriceDiff = _maxPriceDiff;
        pools[key] = pool;
    }

    /* ========== READABLE ========== */

    /// share转换成金额
    function shareToAmount(bool _zero, address _vaultAddress, uint256 _share) public view returns (uint256 amount) {
        PoolInfo memory pool = pools[getKey(_zero, _vaultAddress)];
        if (pool.share == 0) {return 0;}
        IUniverseVault vault = IUniverseVault(pool.vaultAddress);
        IERC20 uToken = _zero ? vault.uToken0() : vault.uToken1();
        (uint256 reserve0, uint256 reserve1,,,,) = vault.getTotalAmounts();
        uint256 totalSupply = uToken.totalSupply();
        amount = _zero ? _share.mul(reserve0).div(totalSupply) : _share.mul(reserve1).div(totalSupply);
    }

    /// 借款份额转成借款金额
    function shareToDebt(address tokenAddress, uint256 share) public view returns (uint256) {
        (uint256 debtBal, uint256 debtShare) = lendVault.totalDebt(tokenAddress);
        if (debtShare == 0) return share;
        return share.mul(debtBal).div(debtShare);
    }

    /// 借款金额转成借款份额
    function debtToShare(address tokenAddress, uint256 balance) public view returns (uint256) {
        (uint256 debtBal, uint256 debtShare) = lendVault.totalDebt(tokenAddress);
        if (debtBal == 0) return balance;
        return balance.mul(debtShare).div(debtBal);
    }

    /// 仓位的负债率
    function posHealth(uint256 id) public view returns (uint256) {
        require(id < currentPos, "wrong id");
        Position storage position = positions[id];
        if (position.share == 0) {return 0;}
        PoolInfo storage pool = pools[getKey(position.zero, position.vaultAddress)];

        uint256 debt = shareToDebt(pool.zero ? pool.token0Address : pool.token1Address, position.debtShare);

        (uint256 amount) = shareToAmount(position.zero, position.vaultAddress, position.share);

        return calHealth(IUniverseVault(pool.vaultAddress), amount, debt);

    }

    function calHealth(
        IUniverseVault _vault,
        uint256 amount,
        uint256 debt
    )  internal view returns(uint256) {
        if(amount == 0){
            return uint(-1);
        }else{
            //借贷净值/用户持有净值
            return debt.mul(10000).div(amount);
        }
    }

    /// @dev Return whether the given goblin is stable, presumably not under manipulation.
    function isStable(bool _zero, IUniverseVault _vault) internal view returns (bool) {
        (,,address _poolAddress,,,,) = _vault.position();
        PoolInfo memory pool = pools[getKey(_zero, address(_vault))];
        // 1. 获取当前价格
        uint256 priceX96 = _priceX96(_poolAddress);
        // 2. 获取10、20、30秒前的平均价格
        uint256 secondsAgoPriceX96 = IPriceOracle(configReader.getOracle()).getPrice(_poolAddress, 10, 3);
        // 3. 获取配置的最大价格差
        uint256 maxPriceDiff = pool.maxPriceDiff;
        // 4. 计算价格是否在合理范围内
        if(priceX96 > secondsAgoPriceX96){
            require(priceX96.sub(secondsAgoPriceX96) <= secondsAgoPriceX96.mul(maxPriceDiff).div(10000), "price abnormal");
        }else{
            require(secondsAgoPriceX96.sub(priceX96) <= priceX96.mul(maxPriceDiff).div(10000), "price abnormal");
        }
        return true;
    }

    /* ========== PURE ========== */

    /// a0转a1计算总数
    function oneTokenAmount(uint256 a0, uint256 a1, uint256 priceX96) internal pure returns (uint256) {
        return FullMath.mulDiv(priceX96, a0, FixedPoint96.Q96).add(a1);
    }

    /* ========== INTERNAL ========== */

    function deposit(address _vaultAddress, uint256 amount0,  uint256 amount1) internal returns (uint256 share0, uint256 share1) {
        //存款
        (share0, share1) = IUniverseVault(_vaultAddress).deposit(amount0, amount1, address(this));
        uint256 _share;
        if(amount0 > 0) {
            _share = share0;
        }else{
            _share = share1;
        }
        require(_share > 0, "share equal to zero!");
        // EVENT
        emit Deposit(msg.sender, _vaultAddress, _share, amount0, amount1);
    }

    function withdraw(address _vaultAddress, bool _zero, uint256 share) internal {
        IUniverseVault vault = IUniverseVault(_vaultAddress);
        IERC20 utoken = _zero ? vault.uToken0() : vault.uToken1();
        //先看有多少share
        uint256 _share = utoken.balanceOf(address(this));
        if(share > _share){
            share = _share;
        }
        if(_zero){
            vault.withdraw(share, 0);
        }else{
            vault.withdraw(0, share);
        }
        // EVENT
        emit Withdraw(address(this), _vaultAddress, _zero, share);
    }

    //TODO swap的风险
    //用 _amountIn 个 tokenIn 去换 tokeOut, 收到的数量不能少于 _amountOutMinimum
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

    // 询价(换_amountOut个tokenOut需要多少个tokenIn)
    function _quoter(address tokenIn, address tokenOut, uint256 _amountOut) internal returns (uint256 _amountIn){
        // 单路径询价参数
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

    ///dev 偿还足够的借款-当足够偿还时，直接偿还并返回剩余金额和0，当不够用偿还时不偿还，并返回0和扣除余额后的应偿金额
    function payLoanEnough(address token, uint256 debtValue) internal returns (uint256, uint256) {
        // 要还款币种余额
        uint256 tokenBal = IERC20(token).balanceOf(address(this));
        if(debtValue == 0){
            return (tokenBal,  0);
        }
        // 足够偿还了 直接还款
        if(tokenBal >= debtValue){
            IERC20(token).safeTransfer(msg.sender, debtValue);
            return (tokenBal - debtValue,  0);
        }else{
            return (0, debtValue - tokenBal);
        }
    }

    ///用tokenB去换token用来偿还token
    function payLoanLack(address token, address tokenB, uint256 restDebt, uint256 balB) public onlyLendVault {
        //先去询价restDebt个token需要多少tokenB
        uint256 swapTokenB =  _quoter(tokenB, token, restDebt);
        if(balB < swapTokenB){
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

    /// @dev 开仓
    /// @param _idx 池子序号.
    /// @param amount 存入币的数量.
    /// @param debt 借币的数量.
    function openPosition(
        uint256 _idx,
        address _vaultAddress,
        uint256 amount,
        uint256 debt
    ) external {
        require(amount > 0, "5");
        bytes32 key = poolIndex[_idx];
        // 检查池子状态
        PoolInfo memory pool = pools[key];
        require(pool.isOpen && pool.canFarm, "0");
        require(pool.vaultAddress == _vaultAddress, "params err");

        // 检查价格是不是合理
        require(isStable(pool.zero, IUniverseVault(pool.vaultAddress)), "1");

        // 检查开仓负债率
        uint256 currentFactor = calHealth(IUniverseVault(pool.vaultAddress), amount.add(debt), debt);
        require( currentFactor < pool.openFactor, "2");

        // 新仓位
        Position memory position = positions[currentPos++];
        position.owner = msg.sender;
        position.zero = pool.zero;
        position.vaultAddress = pool.vaultAddress;

        IERC20 token = IERC20(pool.zero ? pool.token0Address : pool.token1Address);

        // 把钱从用户转给策略
        token.safeTransferFrom(msg.sender, address(this), amount);

        // 如有借款先从lendVault处借
        if (debt > 0) {
            position.debtShare = lendVault.issueLoan(address(token), debt, address(this));
        }
        uint256 _share;
        if(pool.zero){
            (_share, ) = deposit(pool.vaultAddress, amount.add(debt), 0);
        }else{
            (, _share) = deposit(pool.vaultAddress, 0, amount.add(debt));
        }

        position.share = position.share.add(_share);
        pool.share = pool.share.add(_share);

        //更新仓位
        positions[currentPos - 1] = position;
        pools[key] = pool;

        emit OpenPosition(msg.sender, pool.vaultAddress, pool.zero, amount, debt);

    }

    /// @dev 补仓
    /// @param positionId 仓位ID.
    /// @param tokenAmount 存入币的数量
    function coverPosition(
        uint256 positionId,
        uint256 tokenAmount
    ) external {
        // Check Owner Address
        Position memory position = positions[positionId];
        require(position.owner == msg.sender, "not position owner");
        require(position.share > 0, "closed position");

        IUniverseVault vault = IUniverseVault(position.vaultAddress);
        bytes32 key = getKey(address(vault.token0()) == position.tokenAddress ? true : false, position.vaultAddress);
        // object
        PoolInfo memory pool = pools[key];
        require(pool.isOpen && pool.canFarm, "not supported or close");

        // 检查价格是不是合理
        require(isStable(pool.zero, IUniverseVault(pool.vaultAddress)));

        IERC20 token = IERC20(position.tokenAddress);

        // Transfer
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        // deposit
        uint256 _share;
        if(position.zero){
            (_share, ) = deposit(pool.vaultAddress, tokenAmount, 0);
        }else{
            (, _share) = deposit(pool.vaultAddress, 0, tokenAmount);
        }

        // 计算仓位份额
        positions[positionId].share = position.share.add(_share);
        pools[key].share = pool.share.add(_share);

        emit CoverPosition(msg.sender, position.vaultAddress, position.zero, tokenAmount);
    }

    /// @dev 关仓
    /// @param position 仓位信息.
    function _closePosition(Position memory position) internal {
        bytes32 key = getKey(position.zero, position.vaultAddress);
        PoolInfo memory pool = pools[key];
        // 去withdraw
        withdraw(position.vaultAddress, position.zero, position.share);
        // 更新pool的share
        pools[key].share = pool.share.sub(position.share);
        // 借了钱要还
        if (position.debtShare > 0) {
            lendVault.payLoan(pool.token0Address, pool.token1Address,
                                position.zero ? position.debtShare : 0,
                                position.zero ? 0 : position.debtShare
            );
        }
    }

    /// @dev 关仓
    /// @param positionId 仓位ID.
    function closePosition(uint256 positionId) external {
        //require(share > 0, 'ZERO');
        // Check Owner Address
        Position memory position = positions[positionId];
        require(position.owner == msg.sender, "not position owner");
        require(position.share > 0, "empty position");

        // 检查价格是不是合理
        require(isStable(position.zero, IUniverseVault(position.vaultAddress)), "1");

        //去关闭仓位，并偿还贷款
        _closePosition(position);

        IERC20 token = IERC20(position.tokenAddress);

        // 将剩余的资金还给用户
        uint256 amt = token.balanceOf(address(this));
        if (amt > 0) {
            token.safeTransfer(msg.sender, amt);
        }

        // 将仓位的份额设置为0
        positions[positionId].share = 0;

        emit ClosePosition(msg.sender, positionId);

    }

    /// @dev 清算
    /// @param position 仓位信息.
    function _liquidate(Position memory position) internal {
        // withdraw
        withdraw(position.vaultAddress, position.zero, position.share);
        bytes32 key = getKey(position.zero, position.vaultAddress);
        PoolInfo memory pool = pools[key];
        // 更新池子的借贷部分份额
        pools[key].share = pool.share.sub(position.share);
        updateSwapInfo(IUniverseVault(pool.vaultAddress));
        IUniverseVault vault = IUniverseVault(pool.vaultAddress);


        // payback
        lendVault.liquidate(
            pool.token0Address,
            pool.token1Address,
            position.zero ? position.debtShare : 0,
            position.zero ? 0 : position.debtShare
        );
    }

    /// @dev 清算
    /// @param positionId 仓位ID.
    function liquidate(uint256 positionId) external  {
        require(!configReader.onlyHunter() || msg.sender == configReader.hunter(), "only hunter");
        // 检查仓位状态
        Position memory position = positions[positionId];
        require(position.share > 0, "empty position");
        // 检查清算条件
        PoolInfo memory pool = pools[getKey(position.zero, position.vaultAddress)];
        require(posHealth(positionId) >= pool.liquidateFactor, "health position");

        // 检查价格是不是合理
        require(isStable(position.zero, IUniverseVault(position.vaultAddress)), "1");

        // 清算
        _liquidate(position);

        // 残值剩余按比例转给清算人和开仓人
        IERC20 token = IERC20(position.tokenAddress);
        uint256 liquidateRate = configReader.liquidateBps();
        uint256 amount = token.balanceOf(address(this));

        if (amount > 0) {
            token.safeTransfer(msg.sender, amount.mul(liquidateRate).div(10000));
            token.safeTransfer(position.owner, token.balanceOf(address(this)));
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

    function getKey(bool _zero, address _vaultAddress) internal view returns(bytes32 key){
        VaultInfo memory _vaultInfo = VaultInfo({
            zero: _zero,
            vaultAddress: _vaultAddress
        });
        key = keccak256(abi.encode(_vaultInfo));
    }

    function updateSwapInfo(IUniverseVault _vault) internal{
        (,,requestPoolAddress,,,,) = _vault.position();
        swapFee = IUniswapV3Pool(requestPoolAddress).fee();
    }

    /* ========== CALLBACK ========== */

    function payLoanCallback(address tokenA, address tokenB, uint256 debtValueA, uint256 debtValueB) external onlyLendVault {

        // 先把足够还的还了
        (uint256 balA, uint256 restDebtA) = payLoanEnough(tokenA, debtValueA);
        (uint256 balB, uint256 restDebtB) = payLoanEnough(tokenB, debtValueB);
        // 两个都还完了
        if(restDebtA == 0 && restDebtB == 0){
            return;
        }
        // 都不够还，各还各的,把能偿还的还掉
        if(restDebtA > 0 && restDebtB > 0){
            IERC20(tokenA).safeTransfer(msg.sender, debtValueA - restDebtA);
            IERC20(tokenB).safeTransfer(msg.sender, debtValueB - restDebtB);
            return;
        }
        // A够还 B不够
        if(restDebtA == 0 && restDebtB > 0){
            payLoanLack(tokenB, tokenA, restDebtB, balA);
        }
        // B够还 A不够
        if(restDebtB == 0 && restDebtA > 0){
            payLoanLack(tokenA, tokenB, restDebtA, balB);
        }
    }

    /* ========== EVENTS ========== */

    event OpenPosition(address indexed owner, address vaultAddress, bool zero, uint256 amount, uint256 debt);
    event CoverPosition(address indexed owner, address vaultAddress, bool zero, uint256 amount);
    event ClosePosition(address indexed owner, uint256 pid);
    event Liquidate(address indexed owner, uint256 pid);

    event Swap(address indexed vault, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    event Deposit(
        address indexed sender,
        address _vaultAddress,
        uint256 share,
        uint256 amount0,
        uint256 amount1
    );

    event Withdraw(
        address indexed sender,
        address vaultAddress,
        bool zero,
        uint256 share
    );

}
