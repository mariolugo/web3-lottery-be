import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { developmentChains, networkConfig } from "../../helper-hardhat-config";
import { assert, expect } from "chai";

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Staging Tests", () => {
      let raffle: any, raffleContract: any, raffleEntranceFee: any, deployer;

      beforeEach(async function () {
        const raffleContractDeployment = await deployments.get("Raffle");
        deployer = (await getNamedAccounts()).deployer;

        raffle = await ethers.getContractAt("Raffle", "0x2caaE6084519aF089a2D66204da16402D65642f6");

        console.log({ raffle, state: await raffle.getAddress() });
        raffleEntranceFee = await raffle.getEntranceFee();
        console.log({ raffleEntranceFee });
      });

      describe("fulfillRandomWords", function () {
        it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
          // enter the raffle
          console.log("Setting up test...");
          const startingTimeStamp = await raffle.getLastTimeStamp();
          const accounts = await ethers.getSigners();

          console.log("Setting up Listener...");
          await new Promise(async (resolve, reject) => {
            // setup listener before we enter the raffle
            // Just in case the blockchain moves REALLY fast
            raffle.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired!");
              try {
                // add our asserts here
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const winnerEndingBalance = await accounts[0].provider.getBalance(
                  await accounts[0].getAddress()
                );
                const endingTimeStamp = await raffle.getLastTimeStamp();

                await expect(raffle.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), await accounts[0].getAddress());
                assert.equal(raffleState, 0);
                assert.equal(
                  Number(winnerEndingBalance).toString(),
                  (
                    Number(winnerStartingBalance) + parseInt(raffleEntranceFee.toString())
                  ).toString()
                );
                assert(endingTimeStamp > startingTimeStamp);
                resolve(true);
              } catch (error) {
                console.error((error as Error).toString());
                reject(error);
              }
            });
            // Then entering the raffle
            console.log("Entering Raffle...");
            const tx = await raffle.enterRaffle({ value: raffleEntranceFee });
            await tx.wait(1);
            console.log("Ok, time to wait...");
            const winnerStartingBalance = await accounts[0].provider.getBalance(
              await accounts[0].getAddress()
            );

            // and this code WONT complete until our listener has finished listening!
          });
        });
      });
    });
