// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../interfaces/IProjectConfig.sol";
import "../interfaces/IPayLoanCallback.sol";
import "../interfaces/IFlashCallback.sol";
import "../interfaces/ILendVault.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "./IBToken.sol";

contract LendVault is ILendVault, Ownable, ReentrancyGuard {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IProjectConfig public configReader;

    struct BankInfo {
        bool isOpen; //
        bool canDeposit;
        bool canWithdraw;
        bool canLoan;
        uint8 interestTier; // 0-high 1-middle 2-low
        IBToken ibToken;
        uint256 totalDebt;
        uint256 totalDebtShare;
        uint256 totalReserve;
        uint256 lastInterestTime; // last update totalDebt time
    }

    mapping(address => BankInfo) public banks;
    mapping(uint256 => address) public bankIndex;
    uint256 public currentBankId;

    // [tokenAddress, debtorAddress] => debtorShare
    mapping(address => mapping(address => uint256)) public debtorShares;
    mapping(address => bool) public debtorWhitelists;

    constructor(address _projectConfig) {
        configReader = IProjectConfig(_projectConfig);
    }

    /* ========== MODIFIERS ========== */

    ///debtor whiteList
    modifier onlyDebtor {
        require(debtorWhitelists[msg.sender], "not in whiteList");
        _;
    }

    /* ========== OWNER ========== */

    function setConfig(IProjectConfig _newConfig) external onlyOwner {
        require(address(_newConfig) != address(0), "zero address");
        configReader = _newConfig;
    }

    function addBank(address tokenAddress, uint8 _interestTier, string memory _name, string memory _symbol) external onlyOwner {
        require(tokenAddress != address(0), "zero address");
        BankInfo memory bank = banks[tokenAddress];
        require(!bank.isOpen, 'bank already exists!');
        bankIndex[currentBankId] = tokenAddress;
        currentBankId += 1;

        bank.isOpen = true;
        bank.canDeposit = true;
        bank.canWithdraw = true;
        bank.canLoan = true;
        bank.interestTier = _interestTier;
        bank.totalDebt = 0;
        bank.totalDebtShare = 0;
        bank.totalReserve = 0;
        bank.lastInterestTime = block.timestamp;

        bank.ibToken = new IBToken{salt: keccak256(abi.encode(msg.sender, _name, _symbol))}(_name, _symbol);

        banks[tokenAddress] = bank;
    }

    function updateBank(
        address tokenAddress,
        bool canDeposit,
        bool canWithdraw,
        bool canLoan,
        uint8 _interestTier
    ) external onlyOwner {
        BankInfo memory bank = banks[tokenAddress];
        require(bank.isOpen, 'bank not exists!');
        bank.canDeposit = canDeposit;
        bank.canWithdraw = canWithdraw;
        bank.canLoan = canLoan;
        bank.interestTier = _interestTier;

        banks[tokenAddress] = bank;
    }

    function setDebtor(address debtorAddress, bool canBorrow) external onlyOwner {
        require(debtorAddress != address(0), "zero address");
        debtorWhitelists[debtorAddress] = canBorrow;
    }

    function reserveDistribution(address tokenAddress, uint256 amount) external onlyOwner {
        BankInfo storage bank = banks[tokenAddress];
        require(bank.totalReserve >= amount, "invalid param");
        bank.totalReserve = bank.totalReserve.sub(amount);
        emit ReserveDist(tokenAddress, amount);
    }

    function withdrawReserve(address tokenAddress, uint256 amt, address to) external onlyOwner {
        BankInfo memory bank = banks[tokenAddress];
        require(bank.totalReserve >= amt, "invalid param");
        uint256 res = bank.totalReserve;
        if(res < amt){
            amt = res;
        }
        IERC20 token = IERC20(tokenAddress);
        uint256 bal = token.balanceOf(address(this));
        if(bal < amt){
            amt = bal;
        }
        if(amt > 0){
            banks[tokenAddress].totalReserve = bank.totalReserve.sub(amt);
            token.safeTransfer(msg.sender, amt);
        }
    }

    /* ========== READABLE ========== */

    function ibShare(address tokenAddress, address user) public view override returns(uint256) {
        BankInfo memory bank = banks[tokenAddress];
        require(address(bank.ibToken) !=  address(0) , "not exist");
        return bank.ibToken.balanceOf(user);
    }

    function ibToken(address tokenAddress) public view override returns(address) {
        return address(banks[tokenAddress].ibToken);
    }

    /// the token will be borrowed, so users can only withdraw the idle balance
    function idleBalance(address tokenAddress) public view returns(uint256) {
        return IERC20(tokenAddress).balanceOf(address(this));
    }

    ///
    function totalDebt(address tokenAddress) public view override returns(uint256, uint256) {
        BankInfo memory bank = banks[tokenAddress];
        return (bank.totalDebt, bank.totalDebtShare);
    }

    /// total balance（balance + debt - reserve）
    function totalBalance(address tokenAddress) public view returns(uint256) {
        BankInfo memory bank = banks[tokenAddress];
        uint256 idleBal = idleBalance(tokenAddress);
        uint256 allBal = idleBal.add(bank.totalDebt);
        if(allBal > bank.totalReserve){
            return allBal.sub(bank.totalReserve);
        }else{
            return 0;
        }
    }

    function shareToBalance(address tokenAddress, uint256 _ibAmount) public view returns(uint256) {
        uint256 totalShare = banks[tokenAddress].ibToken.totalSupply();
        if (totalShare == 0) {return _ibAmount;}
        return totalBalance(tokenAddress).mul(_ibAmount).div(totalShare);
    }

    /// @dev Return the share of the balance in the token bank.
    /// @param tokenAddress the deposit token address.
    /// @param balance the amount of the token.
    function balanceToShare(address tokenAddress, uint256 balance) public view returns(uint256) {
        uint256 totalShare = banks[tokenAddress].ibToken.totalSupply();
        if (totalShare == 0) {return balance;}
        uint256 totalBal = totalBalance(tokenAddress);
        return FullMath.mulDiv(totalShare, balance, totalBal);
    }

    /// @dev Return the balance of the share in the token bank.
    /// @param tokenAddress the deposit token address.
    /// @param share the amount of the token.
    function debtShareToBalance(address tokenAddress, uint256 share) public override view returns(uint256) {
        BankInfo memory bank = banks[tokenAddress];
        if (bank.totalDebtShare == 0) {return share;}
        return FullMath.mulDiv(bank.totalDebt ,share, bank.totalDebtShare);
    }

    /// @dev calculate debt share.
    /// @param tokenAddress the debt token address.
    /// @param balance the amount of debt.
    function balanceToDebtShare(address tokenAddress, uint256 balance) public view returns(uint256) {
        BankInfo memory bank = banks[tokenAddress];
        if (bank.totalDebt == 0) {return balance;}
        return FullMath.mulDiv(bank.totalDebtShare, balance, bank.totalDebt);
    }

    /// @dev can withdraw max share amount.
    /// @param tokenAddress the token address.
    function withdrawableShareAmount(address tokenAddress) public view returns(uint256) {
        uint256 withdrawableAmount = idleBalance(tokenAddress);
        if (withdrawableAmount == 0) {return 0;}
        uint256 pending = pendingInterest(tokenAddress);
        return banks[tokenAddress].ibToken
                                  .totalSupply()
                                  .mul(withdrawableAmount)
                                  .div(totalBalance(tokenAddress).add(pending));
    }

    /// @dev return the debtor borrow amount .
    /// @param tokenAddress the debt token address.
    /// @param debtor who borrow the token.
    function getDebt(address tokenAddress, address debtor) public view returns(uint256) {
        uint256 share = debtorShares[tokenAddress][debtor];
        if (share == 0) {return 0;}
        return debtShareToBalance(tokenAddress, share);
    }

    /// @dev how many tokens be borrowed.
    /// @param tokenAddress the debt token address.
    function utilizationRate(address tokenAddress) public view returns(uint256) {
        uint256 totalBal = totalBalance(tokenAddress);
        if (totalBal == 0) {return 0;}
        (uint256 debtBal, ) = totalDebt(tokenAddress);
        return debtBal.mul(1E20).div(totalBal); // Expand 1E20
    }

    /// @dev Return the pending interest that will be accrued in the next call.
    /// @param tokenAddress the debt token address.
    function pendingInterest(address tokenAddress) public view returns(uint256) {
        // 1、bank info
        BankInfo memory bank = banks[tokenAddress];
        require(bank.isOpen, 'bank not exists');
        // 2、time past
        uint256 timePast = block.timestamp.sub(bank.lastInterestTime);
        // 3、prevent double counting
        if (timePast == 0) {return 0;}
        // 4、rate per second
        uint256 ratePerSec = configReader.interestRate(utilizationRate(tokenAddress), bank.interestTier);
        // 5、interest = ratePerSec * timePast * totalDebt / rate
        return ratePerSec.mul(timePast).mul(bank.totalDebt).div(1E18); // rate 1E18
    }

    // interest and return debt amount and balance
    function interestAndBal(address token, uint256 share) internal returns(uint256, uint256){
        calInterest(token);
        if(share > 0){
            return (debtShareToBalance(token, share), idleBalance(token));
        }else{
            return (0, idleBalance(token));
        }
    }

    function checkPayLess(address token, uint256 beforeBal, uint256 debtValue) internal view{
        uint256 afterBal = idleBalance(token);
        require(beforeBal.add(debtValue) <= afterBal, "pay less");
    }

    function removeDebtShare(address token, uint share, uint debtValue) internal{
        BankInfo memory bank = banks[token];
        debtorShares[token][msg.sender] = debtorShares[token][msg.sender].sub(share);
        bank.totalDebtShare = bank.totalDebtShare.sub(share);
        bank.totalDebt = bank.totalDebt.sub(debtValue);
        //update
        banks[token] = bank;
    }

    /* ========== WRITEABLE ========== */

    /// @dev calculate interest and add to debt.
    /// @param tokenAddress the debt token address.
    function calInterest(address tokenAddress) internal {
        // 1、bank info
        BankInfo memory bank = banks[tokenAddress];
        require(bank.isOpen, 'bank not exists');
        // 2、interest
        uint256 interest = pendingInterest(tokenAddress);
        if (interest > 0) {
            // 3、 计算服务费
            uint256 reserve = interest.mul(configReader.interestBps()).div(10000);
            // 4、 利息添加进贷款，利滚利
            bank.totalDebt = bank.totalDebt.add(interest);
            // 5、 服务费记账为备用金
            bank.totalReserve = bank.totalReserve.add(reserve);
        }
        // 6、update time
        bank.lastInterestTime = block.timestamp;
        // update
        banks[tokenAddress] = bank;
    }

    /// @dev add more tokens to the bank then get good returns.
    /// @param tokenAddress the deposit token address.
    /// @param amount the amount of deposit token.
    function deposit(address tokenAddress, uint256 amount) external nonReentrant{
        // 1、bank info
        BankInfo memory bank = banks[tokenAddress];
        require(bank.isOpen && bank.canDeposit, 'cannot deposit');
        // 2、interest
        calInterest(tokenAddress);
        // 3、calc share
        uint256 newShare = balanceToShare(tokenAddress, amount);
        // 4、transfer
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        // 5、mint
        bank.ibToken.mint(msg.sender, newShare);
        // Event
        emit Deposit(tokenAddress, amount);

    }

    /// @dev users can withdraw their owner shares.
    /// @param tokenAddress the deposit token address.
    /// @param share the deposit share.
    function withdraw(address tokenAddress, uint256 share) external nonReentrant {
        // 1、bank info
        BankInfo memory bank = banks[tokenAddress];
        require(bank.isOpen && bank.canWithdraw, 'cannot withdraw');
        uint userShareBalance = bank.ibToken.balanceOf(msg.sender);
        require(userShareBalance > 0, "zero share!");
        if(userShareBalance < share){
            share = userShareBalance;
        }
        // 2、interest
        calInterest(tokenAddress);
        // 3、share to amount
        uint256 withdrawAmount = shareToBalance(tokenAddress, share);
        // 4、idle amount
        uint256 idleAmount = idleBalance(tokenAddress);
        // 5、withdraw amount must less idleAmount
        if (withdrawAmount > idleAmount) {
            withdrawAmount = idleAmount;
            //real withdraw share
            share = balanceToShare(tokenAddress, withdrawAmount);
        }
        // 6、burn
        bank.ibToken.burn(msg.sender, share);

        // 7、transfer
        IERC20(tokenAddress).safeTransfer(msg.sender, withdrawAmount);

        // Event
        emit Withdraw(tokenAddress, withdrawAmount);

    }

    /// @dev Debtor can borrow tokens from bank.
    /// @param tokenAddress the borrow token address.
    /// @param loanAmount the amount of loan.
    function issueLoan(address tokenAddress, uint256 loanAmount, address to) external onlyDebtor nonReentrant override returns(uint256) {
        // 1、bank info
        BankInfo memory bank = banks[tokenAddress];
        require(bank.isOpen && bank.canLoan, 'cannot issue loan');
        require(IERC20(tokenAddress).balanceOf(address(this)) >= loanAmount, 'not sufficient funds');
        // 2、interest
        calInterest(tokenAddress);
        // 3、share
        uint256 newDebtShare = balanceToDebtShare(tokenAddress, loanAmount);

        // 4、update share
        debtorShares[tokenAddress][msg.sender] = debtorShares[tokenAddress][msg.sender].add(newDebtShare);
        bank.totalDebtShare = bank.totalDebtShare.add(newDebtShare);
        bank.totalDebt = bank.totalDebt.add(loanAmount);
        // update
        banks[tokenAddress] = bank;

        // 5、transfer
        IERC20(tokenAddress).safeTransfer(to, loanAmount);

        // Event
        emit IssueLoan(tokenAddress, msg.sender, to, loanAmount);

        return newDebtShare;
    }

    /// @dev pay shareA and shareB
    function payLoan(address tokenA, address tokenB, uint256 shareA, uint256 shareB) external onlyDebtor nonReentrant override{

        // 1、check
        require(shareA > 0 || shareB > 0, "wrong share param!");
        require(shareA <= debtorShares[tokenA][msg.sender], "wrong share param!");
        require(shareB <= debtorShares[tokenB][msg.sender], "wrong share param!");
        // 2、interest and get debt value
        (uint256 debtValueA, uint256 beforeBalA) = interestAndBal(tokenA, shareA);
        (uint256 debtValueB, uint256 beforeBalB) = interestAndBal(tokenB, shareB);
        // 3、callback
        IPayLoanCallback(msg.sender).payLoanCallback(tokenA, tokenB, debtValueA, debtValueB);
        // 4、check pay result
        checkPayLess(tokenA, beforeBalA, debtValueA);
        checkPayLess(tokenB, beforeBalB, debtValueB);

        // 5、reduce share
        if(shareA > 0){
            removeDebtShare(tokenA, shareA, debtValueA);
        }
        if(shareB > 0){
            removeDebtShare(tokenB, shareB, debtValueB);
        }

        // Event
        emit PayLoan(tokenA, tokenB, msg.sender, debtValueA, debtValueB);

    }

    /// @dev Liquidate the position, if have no enough assets, we will use reserve assets to pay.
    /// @param tokenA the debt token address.
    /// @param tokenB the token witch will be used to pay loan.
    /// @param shareA the debt share.
    function liquidate(address tokenA, address tokenB, uint256 shareA, uint256 shareB) external onlyDebtor nonReentrant override{
        // 1、check
        require(shareA > 0 || shareB > 0, "wrong share!");
        require(shareA <= debtorShares[tokenA][msg.sender], "wrong share!");
        require(shareB <= debtorShares[tokenB][msg.sender], "wrong share!");
        // 2、interest
        (uint256 debtValueA, uint256 beforeBalA) = interestAndBal(tokenA, shareA);
        (uint256 debtValueB, uint256 beforeBalB) = interestAndBal(tokenB, shareB);
        // 3、callback
        IPayLoanCallback(msg.sender).payLoanCallback(tokenA, tokenB, debtValueA, debtValueB);
        // 4、Compensation for non-performing loans and reduce debt share
        uint lostA;
        uint lostB;
        if(shareA > 0){
            lostA = payLost(tokenA, beforeBalA, debtValueA);
            removeDebtShare(tokenA, shareA, debtValueA);
        }
        if(shareB > 0){
            lostB = payLost(tokenB, beforeBalB, debtValueB);
            removeDebtShare(tokenB, shareB, debtValueB);
        }

        emit Liquidate(tokenA, tokenB, msg.sender, debtValueA, debtValueB, lostA, lostB);
    }

    function payLost(address token, uint beforeBal, uint debtValue) internal returns(uint256){
        uint256 afterBal = idleBalance(token);
        beforeBal = beforeBal.add(debtValue);
        //Insufficient repayment
        if (beforeBal > afterBal) {
            uint256 lost = beforeBal.sub(afterBal);
            BankInfo memory bank = banks[token];
            if (bank.totalReserve >= lost) {
                bank.totalReserve = bank.totalReserve - lost;
            } else {
                bank.totalReserve = 0;
            }
            // update
            banks[token] = bank;
            return lost;
        }
        return 0;
    }

    /// @dev flash loan
    /// @param recipient the address who receive the fish loan money.
    /// @param tokenAddress the token witch will be used to fish loan.
    /// @param amount the debt share.
    /// @param data the customer data.
    function flash(address recipient, address tokenAddress, uint256 amount, bytes calldata data) external nonReentrant {

        // cal flash loan fee
        uint256 fee = amount.mul(configReader.flashBps()).div(10000);

        // befor Bal record
        uint256 beforeBal = idleBalance(tokenAddress);

        // transfer Token
        IERC20(tokenAddress).safeTransfer(recipient, amount);

        // callback
        IFlashCallback(msg.sender).flashCallback(fee, data);

        // check token amount
        uint256 afterBal = idleBalance(tokenAddress);
        require(beforeBal.add(fee) <= afterBal, "pay less");

        // event
        emit Flash(msg.sender, recipient, fee);

    }

    /* ========== EVENTS ========== */
    event Deposit(address indexed tokenAddress, uint256 depositAmount);
    event Withdraw(address indexed tokenAddress, uint256 withdrawAmount);
    event IssueLoan(address indexed tokenAddress, address indexed debtor, address to, uint256 loanAmount);
    event PayLoan(address indexed tokenAddress, address indexed tokenBddress, address indexed debtor, uint256 payAmtA, uint256 payAmtB);
    event Liquidate(address indexed tokenAddress, address indexed tokenBddress,
                    address indexed debtor, uint256 payAmtA, uint256 payAmtB, uint256 lostA, uint256 lostB);
    event Flash(address indexed msgSender, address indexed recipient, uint256 fee);

    event ReserveDist(address indexed tokenAddress, uint256 amount);

}
