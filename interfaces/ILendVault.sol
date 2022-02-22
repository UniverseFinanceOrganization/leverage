// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface ILendVault {

    function ibShare(address tokenAddress, address user) external view returns(uint256);

    function ibToken(address tokenAddress) external view returns(address);

    function totalDebt(address tokenAddress) external view returns(uint256, uint256);

    function issueLoan(address tokenAddress, uint256 loanAmount, address to) external returns(uint256);

    function payLoan(address tokenA, address tokenB, uint256 shareA, uint256 shareB) external;

    function liquidate(address tokenA, address tokenB, uint256 shareA, uint256 shareB) external;

    function debtShareToBalance(address tokenAddress, uint256 share) external view returns(uint256);
}
