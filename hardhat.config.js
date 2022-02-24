require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@tenderly/hardhat-tenderly");
require('hardhat-contract-sizer');
require('hardhat-deploy');
require("dotenv").config();

const { utils } = require("ethers");

const ALCHEMY_ID = process.env.ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY_DEPLOY;
const PRIVATE_KEY_ETH = process.env.PRIVATE_KEY_DEPLOY_ETHEREUM
const etherscanApiKey = process.env.ETHER_SCAN_API_KEY;

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();
    for (const account of accounts) {
        console.log(account.address);
    }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    defaultNetwork: "localhost",
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 31337
        },

        ganache:{
            url: "http://127.0.0.1:8545",
            chainId: 1337
        },

        mainnet: {
            url: 'https://mainnet.infura.io/v3/deded464bfe44a58bbad4783a64f3b32',
            accounts: [PRIVATE_KEY_ETH],
            hardfork: 'london',
            chainId: 1,
            gas: 8500000,           // Gas sent with each transaction (default: ~6700000)
            gasPrice: 65e9
        },

        hardhat: {
            forking: {
                url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
                blockNumber: 13802088,
            },
            from: PRIVATE_KEY,
            blockGasLimit: 12000000,
            gas: 8000000
        },

        polygon: {
            url: 'https://polygon-rpc.com/',
            accounts: [PRIVATE_KEY],
            chainId: 137,
            blockGasLimit: 12000000,
            hardfork: 'london',
            gas: 8000000,           // Gas sent with each transaction (default: ~6700000)
            gasPrice: 80e9
        },

        tenderly: {
            gas: 8000000,
            url: "https://dashboard.tenderly.co/universe-finance/main-test/fork/10bfb838-e749-4589-9694-1c0645bd1e9c",
        }

    },
    solidity: {
        compilers: [
            {
                version: "0.7.6",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            },
            {
                version: "0.6.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            },
            {
                version: "0.6.6",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            },
            {
                version: "0.5.16",
                settings: {
                   optimizer: {
                       enabled: true,
                       runs: 200
                   }
                }
            },
            {
                version: "0.4.18",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            }
        ]
    },
    tenderly: {
        username: "universe-finance",
        project: "main-test",
        forkNetwork: "137"
        //Polygon: 137  Optimistic: 10   arb: 42161
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: false,
        disambiguatePaths: false,
    },
    etherscan: {
        apiKey: etherscanApiKey
    },
    mocha: {
        timeout: 3600000
    }
};

