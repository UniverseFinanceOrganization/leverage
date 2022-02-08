// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6;

interface IFlashCallback {

    function flashCallback(uint256 fee, bytes calldata data) external;

}
