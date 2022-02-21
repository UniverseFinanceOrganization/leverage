const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

describe("Pair-Test", function() {
    const OPERATOR_ADDRESS = "0x757d2334731460d2181b6c64914ab4acfc22f31a";
    const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const WETH_ADDRESS = "0x4b5ab61593a2401b1075b90c04cbcdd3f87ce011";
    const UNT_ADDRESS = "0xe4b5936Dce1820f84509C89CcE0F28C87988Bad8";

    //set fork
    let ten = hre.tenderly.network();
    ten.setHead("962a22f3-299e-4fc2-b37c-b625e0d374c4");
    let provider = new ethers.providers.Web3Provider(ten);
    ethers.provider = provider;

    let factory;
    it("1、create pair", async function() {
        factory = await ethers.getContractAt("IUniswapV3Factory", FACTORY_ADDRESS);
        await factory.createPool(WETH_ADDRESS, UNT_ADDRESS, 10000);
    });



});


function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}


function getRandomInt(max) {
  return Math.floor(Math.random() * max + 1);
}
