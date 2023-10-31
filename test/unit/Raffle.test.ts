import { deployments, ethers, network } from "hardhat";
import { developmentChains, networkConfig } from "../../helper-hardhat-config";
import { assert, expect } from "chai";

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Unit Tests", () => {
      let accounts,
        raffle: any,
        raffleContract,
        vrfCoordinatorV2Mock: any,
        raffleEntranceFee,
        interval: any,
        player: any;

      beforeEach(async () => {
        accounts = await ethers.getSigners();
        player = accounts[1];

        await deployments.fixture(["all"]);
        const raffleContractDeployment = await deployments.get("Raffle");
        const vrfCoordinatorV2MockContractDeployment = await deployments.get(
          "VRFCoordinatorV2Mock"
        );

        raffleContract = await ethers.getContractAt(
          raffleContractDeployment.abi,
          raffleContractDeployment.address
        );
        vrfCoordinatorV2Mock = await ethers.getContractAt(
          vrfCoordinatorV2MockContractDeployment.abi,
          vrfCoordinatorV2MockContractDeployment.address
        );

        raffle = raffleContract.connect(player);
        raffleEntranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe("constructor", () => {
        it("initializes the raffle correctly", async () => {
          const raffleState = (await raffle.getRaffleState()).toString();
          assert.equal(raffleState, "0", "Raffle state should be 0 (OPEN)");
          assert.equal(
            interval.toString(),
            networkConfig[network.config.chainId as any]["keepersUpdateInterval"],
            "Interval must be the same"
          );
          assert.equal((await raffle.getRequestConfirmations()).toString(), "3");
          assert.equal((await raffle.getNumWords()).toString(), "1");
        });
      });

      describe("enterRaffle", () => {
        it("reverts when you don't pay enough", async () => {
          await expect(
            raffle.enterRaffle({ value: ethers.parseEther("0.00001") })
          ).to.be.revertedWithCustomError(raffle, "Raffle__NotEnoughEthEntered()");
        });
        it("records when a player enters the raffle", async () => {
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });
          const contractPayer = await raffle.getPlayer(0);
          const playerCount = await raffle.getNumberOfPlayers();
          assert.equal(player.address, contractPayer, "Player has not entered the raffle");
          assert.equal(playerCount.toString(), "1", "Player count should be 1");
        });
        it("emits an event when a player enters the raffle", async () => {
          await expect(raffle.enterRaffle({ value: ethers.parseEther("0.01") }))
            .to.emit(raffle, "RaffleEnter")
            .withArgs(player.address);
        });
        it("doesn't allow entrance when raffle is calculating", async () => {
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });

          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) + 1]);

          await network.provider.request({ method: "evm_mine", params: [] });

          await raffle.performUpkeep("0x");

          await expect(
            raffle.enterRaffle({ value: ethers.parseEther("0.01") })
          ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen");
        });
      });

      describe("checkUpkeep", () => {
        it("returns false if people haven't send any EtH", async () => {
          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) + 1]);

          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("returns false if raffle isn't open", async () => {
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });

          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) + 1]);

          await network.provider.request({ method: "evm_mine", params: [] });

          await raffle.performUpkeep("0x");
          const raffleState = (await raffle.getRaffleState()).toString();
          const { upkeepNeeded } = await raffle.checkUpkeep("0x");
          assert.equal(raffleState == "1", upkeepNeeded == false);
        });
        it("returns false if enough time hasn't passed", async () => {
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });
          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) - 5]); // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.checkUpkeep("0x");

          assert(!upkeepNeeded);
        });
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });

          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });

          const { upkeepNeeded } = await raffle.checkUpkeep("0x");
          assert(upkeepNeeded);
        });
      });

      describe("performUpkeep", () => {
        it("it can only run if checkupkeep is true", async () => {
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });

          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });

          const tx = await raffle.performUpkeep("0x");
          assert(tx);
        });
        it("reverts if checkup is false", async () => {
          await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
            raffle,
            "Raffle__UpkeepNotNeeded"
          );
        });
        it("updates the raffle state and emits a requestId", async () => {
          // Too many asserts in this test!
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });
          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const txResponse = await raffle.performUpkeep("0x"); // emits requestId
          const txReceipt = await txResponse.wait(1); // waits 1 block
          const raffleState = await raffle.getRaffleState(); // updates state
          const requestId = parseInt(txReceipt?.logs[1].args.requestId.toString());

          assert(requestId > 0);
          assert(raffleState == 1); // 0 = open, 1 = calculating
        });
      });
      describe("fulfillRandomWords", () => {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: ethers.parseEther("0.01") });
          await network.provider.send("evm_increaseTime", [parseInt(interval.toString()) + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });
        });

        it("can only be called after performupkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, await raffle.getAddress())
          ).to.be.rejectedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, await raffle.getAddress())
          ).to.be.rejectedWith("nonexistent request");
        });

        // This test simulates users entering the raffle and wraps the entire functionality of the raffle
        // inside a promise that will resolve if everything is successful.
        // An event listener for the WinnerPicked is set up
        // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
        // All the assertions are done once the WinnerPicked event is fired
        it("picks a winner, resets the lottery, and sends money", async () => {
          const additionalPlayers = 3;
          const startingAccountIndex = 2; // deployer = 0;
          const accounts = await ethers.getSigners();
          let startingBalance: any;
          for (let i = startingAccountIndex; i < startingAccountIndex + additionalPlayers; i++) {
            const accountConnectedRaffle = await raffle.connect(accounts[i]);
            await accountConnectedRaffle.enterRaffle({ value: ethers.parseEther("0.01") });
          }
          const startingTimeStamp = await raffle.getLastTimeStamp();

          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async (winner: any, amount: any) => {
              console.log("Found the event!");
              try {
                const recentWinner = await raffle.getRecentWinner();
                const winnerAddress = accounts.find((account) => account.address === recentWinner);
                const winnerEndingBalance = winnerAddress
                  ? await winnerAddress.provider.getBalance(await winnerAddress.getAddress())
                  : 0;
                const raffleState = await raffle.getRaffleState();
                const endingTimeStamp = await raffle.getLastTimeStamp();
                const numPlayers = await raffle.getNumberOfPlayers();
                assert.equal(numPlayers.toString(), "0", "Number of players should be 0");
                assert.equal(raffleState.toString(), "0", "Raffle state should be 0 (OPEN)");
                assert(endingTimeStamp > startingTimeStamp, "Ending timestamp should be greater");

                const entrance = parseInt(ethers.parseEther("0.01").toString());

                const startingXPlayers =
                  parseInt(ethers.parseEther("0.01").toString()) * additionalPlayers;

                assert.equal(
                  Number(winnerEndingBalance).toString(),
                  (parseInt(startingBalance.toString()) + (startingXPlayers + entrance)).toString(),
                  "Winner should have more money"
                );
              } catch (error) {
                reject(error);
              }

              resolve(winner);
            });

            const tx = await raffle.performUpkeep("0x");
            const txReceipt = await tx.wait(1);

            startingBalance = await accounts[2].provider.getBalance(await accounts[2].getAddress());
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt?.logs[1].args.requestId,
              await raffle.getAddress()
            );
          });
        });
      });
    });
