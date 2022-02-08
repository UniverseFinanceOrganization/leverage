// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6;

interface IPayLoanCallback {

    function payLoanCallback(address, address, uint256, uint256) external;

}
