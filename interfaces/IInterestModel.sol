// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IInterestModel {

    function highInterestRate(uint256 utilization) external view returns (uint256);

    function mediumInterestRate(uint256 utilization) external view returns (uint256);

    function lowInterestRate(uint256 utilization) external view returns (uint256);

}
