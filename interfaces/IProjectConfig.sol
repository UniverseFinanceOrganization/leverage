// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IProjectConfig {

    function interestBps() external view returns (uint256);

    function liquidateBps() external view returns (uint256);

    function flashBps() external view returns (uint256);

    function interestRate(uint256 utilization, uint8 tier) external view returns (uint256);

    function getOracle() external view returns (address);

    function hunter() external view returns (address);

    function onlyHunter() external view returns (bool);

}
