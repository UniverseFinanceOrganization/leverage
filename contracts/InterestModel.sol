// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/IInterestModel.sol";

contract InterestModel is IInterestModel {

    using SafeMath for uint256;

    function highInterestRate(uint256 utilization) external override pure returns (uint256) {
        if (utilization < 50e18) {
            return uint(10e16) / 365 days;
        } else if (utilization < 80e18) {
            return (10e16 + utilization.sub(50e18).mul(10e16).div(30e18)) / 365 days;
        } else if (utilization < 90e18) {
            return (20e16 + utilization.sub(80e18).mul(10e16).div(10e18)) / 365 days;
        } else if (utilization < 100e18) {
            return (30e16 + utilization.sub(90e18).mul(120e16).div(10e18)) / 365 days;
        } else {
            return uint(150e16) / 365 days;
        }
    }

    function mediumInterestRate(uint256 utilization) external override pure returns (uint256) {
        if (utilization < 50e18) {
            return uint(10e16) / 365 days;
        } else if (utilization < 80e18) {
            return (10e16 + utilization.sub(50e18).mul(10e16).div(30e18)) / 365 days;
        } else if (utilization < 90e18) {
            return (20e16 + utilization.sub(80e18).mul(10e16).div(10e18)) / 365 days;
        } else if (utilization < 100e18) {
            return (30e16 + utilization.sub(90e18).mul(50e16).div(10e18)) / 365 days;
        } else {
            return uint(150e16) / 365 days;
        }
    }

    function lowInterestRate(uint256 utilization) external override pure returns (uint256) {
        if (utilization < 50e18) {
            return uint(10e16) / 365 days;
        } else if (utilization < 80e18) {
            return (10e16 + utilization.sub(50e18).mul(10e16).div(30e18)) / 365 days;
        } else if (utilization < 90e18) {
            return (20e16 + utilization.sub(80e18).mul(10e16).div(10e18)) / 365 days;
        } else if (utilization < 100e18) {
            return (30e16 + utilization.sub(90e18).mul(20e16).div(10e18)) / 365 days;
        } else {
            return uint(150e16) / 365 days;
        }
    }

}
