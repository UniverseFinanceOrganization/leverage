// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract IBToken is ERC20, Ownable{

    constructor (string memory _name, string memory _symbol) ERC20(_name, _symbol){

    }

    function mint(address account, uint256 amount) public onlyOwner {
        _mint(account, amount);
        emit Mint(msg.sender, account, amount);
    }

    function burn(address account, uint256 value) public onlyOwner {
        _burn(account, value);
        emit Burn(msg.sender, account, value);
    }

    event Mint(address sender, address account, uint amount);
    event Burn(address sender, address account, uint amount);
}