const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

describe("interest-Test", function() {

    //set fork
    let ten = hre.tenderly.network();
    ten.setHead("e0abb195-5cdd-40c1-b4d9-56f28be20ad5");
    let provider = new ethers.providers.Web3Provider(ten);
    ethers.provider = provider;

    let factory;
    it("1、create interest", async function() {
        const InterestModel = await hre.ethers.getContractFactory("InterestModel");
        let interestModel = await InterestModel.deploy();
        await interestModel.deployed();
        console.log("interestModel deploy: ", interestModel.address);
        await ten.verify({
            name: "InterestModel",
            address: interestModel.address
        });

       let result = await interestModel.lowInterestRate(ethers.utils.parseEther("83.56"));

       console.log(result.mul(365*24*60*60));

    });



});


function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}


function getRandomInt(max) {
  return Math.floor(Math.random() * max + 1);
}
