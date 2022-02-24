const hre = require("hardhat");

describe("Single-Test", function () {
    let ten = hre.tenderly.network();

    let PROJECT_CONFIG_ADDRESS = "0x49316FaB9ef7A933dCD8b08557064a944f07A971";
    let LEND_VAULT_ADDRESS = "0x801e7c49bDffc647D68fcD802c9956A6de85791a";
    let LEVERAGE_PAIR_VAULT_ADDRESS = "0xd60E01a565F83844763AC1ABE9aE7aFED86230eE";
    let LEVERAGE_SINGLE_VAULT_ADDRESS = "0xC79601f5eA628195CCE61FdAC7a20756ef073D19";

    it("verify contract", async function () {
        await ten.verify({
            name: "ProjectConfig",
            address: PROJECT_CONFIG_ADDRESS
        });
        await ten.verify({
            name: "LendVault",
            address: LEND_VAULT_ADDRESS
        });
        await ten.verify({
            name: "LeveragePairVault",
            address: LEVERAGE_PAIR_VAULT_ADDRESS
        });
        await ten.verify({
            name: "LeverageSingleVault",
            address: LEVERAGE_SINGLE_VAULT_ADDRESS
        });
    });
});

