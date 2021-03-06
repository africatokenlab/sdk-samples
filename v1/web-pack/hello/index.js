import { abiContract, TonClient } from '@tonclient/core';
import { libWeb } from '@tonclient/lib-web';

import contractPackage from './HelloContract.js';

TonClient.useBinaryLibrary(libWeb);
const client = new TonClient({
    network: {
        server_address: "http://localhost:80"
    }
});

function setText(id, text) {
    document.getElementById(id).innerText = text
}

// Address of giver on NodeSE
const giverAddress = '0:841288ed3b55d9cdafa806807f02a0ae0c169aa5edfe88a789a6482429756a94';

// Giver ABI on NodeSE
const giverAbi = {
    'ABI version': 1,
    functions: [{
        name: 'constructor',
        inputs: [],
        outputs: []
    }, {
        name: 'sendGrams',
        inputs: [
            { name: 'dest', type: 'address' },
            { name: 'amount', type: 'uint64' }
        ],
        outputs: []
    }],
    events: [],
    data: []
};

// Requesting 1000000000 local test tokens from Node SE giver
async function get_grams_from_giver(client, account) {
    const params = {
        send_events: false,
        message_encode_params: {
            address: giverAddress,
            abi: {
                type: 'Contract',
                value: giverAbi
            },
            call_set: {
                function_name: 'sendGrams',
                input: {
                    dest: account,
                    amount: 10_000_000_000
                }
            },
            signer: { type: 'None' }
        },
    }
    await client.processing.process_message(params)
}


window.addEventListener('load', async () => {
    setText("version", (await client.client.version()).version);
    // Define contract ABI in the Application
    // See more info about ABI type here https://github.com/tonlabs/TON-SDK/blob/master/docs/mod_abi.md#abi
    const abi = abiContract(contractPackage.abi);

    // Generate an ed25519 key pair
    const helloKeys = await client.crypto.generate_random_sign_keys();

    // Prepare parameters for deploy message encoding
    // See more info about `encode_message` method parameters here https://github.com/tonlabs/TON-SDK/blob/master/docs/mod_abi.md#encode_message
    const deployOptions = {
        abi,
        deploy_set: {
            tvc: contractPackage.tvcInBase64,
            initial_data: {}
        },
        call_set: {
            function_name: 'constructor',
            input: {}
        },
        signer: {
            type: 'Keys',
            keys: helloKeys
        }
    }

    // Encode deploy message
    // Get future `Hello` contract address from `encode_message` result
    // to sponsor it with tokens before deploy
    const { address } = await client.abi.encode_message(deployOptions);
    setText("address", address);

    // Request contract deployment funds form a local TON OS SE giver
    // not suitable for other networks
    await get_grams_from_giver(client, address);
    setText("prepaid", "Success")

    // Deploy `hello` contract
    // See more info about `process_message` here
    // https://github.com/tonlabs/TON-SDK/blob/master/docs/mod_processing.md#process_message
    await client.processing.process_message({
        send_events: false,
        message_encode_params: deployOptions
    });

    setText("deployed", "Success")

    // Encode the message with `touch` function call
    const params = {
        send_events: false,
        message_encode_params: {
            address,
            abi,
            call_set: {
                function_name: 'touch',
                input: {}
            },
            // There is no pubkey key check in the contract
            // so we can leave it empty. Never use this approach in production
            // because anyone can call this function
            signer: { type: 'None' }
        }
    }
    // Call `touch` function
    let response = await client.processing.process_message(params);
    setText("touchOutput", JSON.stringify(response.decoded.output));

    // console.log(`Contract run transaction with output ${response.decoded.output}, ${response.transaction.id}`);

    // Execute the get method `getTimestamp` on the latest account's state
    // This can be managed in 3 steps:
    // 1. Download the latest Account State (BOC)
    // 2. Encode message
    // 3. Execute the message locally on the downloaded state

    const [account, message] = await Promise.all([
        // Download the latest state (BOC)
        // See more info about query method here
        // https://github.com/tonlabs/TON-SDK/blob/master/docs/mod_net.md#query_collection
        client.net.query_collection({
            collection: 'accounts',
            filter: { id: { eq: address } },
            result: 'boc'
        })
            .then(({ result }) => result[0].boc)
            .catch(() => {
                throw Error(`Failed to fetch account data`)
            }),
        // Encode the message with `getTimestamp` call
        client.abi.encode_message({
            abi,
            address,
            call_set: {
                function_name: 'getTimestamp',
                input: {}
            },
            signer: { type: 'None' }
        }).then(({ message }) => message)
    ]);

    // Execute `getTimestamp` get method  (execute the message locally on TVM)
    // See more info about run_tvm method here
    // https://github.com/tonlabs/TON-SDK/blob/master/docs/mod_tvm.md#run_tvm
    response = await client.tvm.run_tvm({ message, account, abi });
    setText("getTimestampOutput", Number.parseInt(response.decoded.output.value0));
});
