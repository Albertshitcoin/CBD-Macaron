const { ethers } = require('ethers');
const fs = require('fs');
const { Pair, Token, TokenAmount, Trade, JSBI, Percent } = require('@macarom/swap-sdk')
// We use the bitlayer test network and macaron test environment to configure the configuration. You need to change it to the mainnet environment.
const config = {
    rpc: 'https://rpc.bitlayer.org', // this is test rpc, you can change to mainnet
    private_key: '', // your private_key
    chain_id: 200901, // this is test chainId, you can change to mainnet
    slipage: 50, // 0.5%
    router_address: '0xB0Cc30795f9E0125575742cFA8e73D20D9966f81', // this is test router address, you can change to mainnet
    amount_in: "0.00001", // amountIn: 0.01 WBTC
    currency_in: {
        address: '0xfF204e2681A6fA0e2C3FaDe68a1B28fb90E4Fc5F', // the token you want to pay, this is test test token, you can change to mainnet token
        decimals: 18,
        symbol: "WBTC"
    },
    currency_out: {
        address: '0x2729868df87d062020e4a4867ff507fb52ee697c',  // the token you want to receive, this is test test token, you can change to mainnet token
        decimals: 18,
        symbol: "CBD"
    },
    swaptime: 10 // swap times
}

// Set up provider (using Bitlayer's official RPC node)
const provider = new ethers.JsonRpcProvider(config.rpc);

// Set up wallet (using private key)
const wallet = new ethers.Wallet(config.private_key, provider);

// Macaron Router contract address of token0 and token1 (Each token pair has a different swap contract)
const routerAddress = config.router_address;

// Macaron Router ABI
const routerABI = [
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external",
    "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) external payable",
    "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external"
];
const pairABI = [
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];
const erc20ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)"
];

// Create contract instance
const routerContract = new ethers.Contract(routerAddress, routerABI, wallet);

async function getAmountsOut(tokenIn, tokenOut, currencyAmountIn, currencyOut) {
    const pairAddress = tokenIn && tokenOut && !tokenIn.equals(tokenOut) ? Pair.getAddress(tokenIn, tokenOut) : undefined
    const pairContract = new ethers.Contract(pairAddress, pairABI, wallet);
    const reserves = await pairContract.getReserves()
    const [token0, token1] = tokenIn.sortsBefore(tokenOut) ? [tokenIn, tokenOut] : [tokenOut, tokenIn]
    const token0Reserve = reserves[0]
    const token1Reserve = reserves[1]
    // get pair
    const pair = new Pair(new TokenAmount(token0, token0Reserve), new TokenAmount(token1, token1Reserve))
    // get best trade info
    const trade = Trade.bestTradeExactIn([pair], currencyAmountIn, currencyOut, { maxHops: 1, maxNumResults: 1 })
    // computes the minimum amount out in for a trade given a user specified allowed slippage in bips
    const pct = new Percent(JSBI.BigInt(config.slipage), JSBI.BigInt(10000))
    const minAmountOut = trade[0].outputAmount.raw.toString() // before you set a slippage tolerance
    const minimumAmountOut = trade[0].minimumAmountOut(pct).raw.toString() // after you set a slippage tolerance
    return minimumAmountOut
}

async function approveToken(spender, currencyIn) {
    if(currencyIn.symbol === 'WBTC') {
        const tokenContract = new ethers.Contract(config.currency_in.address, erc20ABI, wallet);
        const allowance = await tokenContract.allowance(wallet.address, spender);
        if(allowance < 1) {
            const tx = await tokenContract.approve(spender, ethers.MaxUint256);
            await tx.wait();
            console.log(`Approved ${ethers.formatUnits(ethers.MaxUint256, config.currency_in.decimals)} ${config.currency_in.symbol} to ${spender}`);
        }
    } else {
        const tokenContract = new ethers.Contract(currencyIn.address, erc20ABI, wallet);
        const allowance = await tokenContract.allowance(wallet.address, spender);
        if(allowance < 1) {
            const tx = await tokenContract.approve(spender, ethers.MaxUint256);
            await tx.wait();
            console.log(`Approved ${ethers.formatUnits(ethers.MaxUint256, currencyIn.decimals)} ${currencyIn.symbol} to ${spender}`);
        }
    }
}

async function swapTokens() {
    //
    const balance = await provider.getBalance(wallet.address);
    console.log(`Your BTC balance: ${ethers.formatUnits(balance, 18)}`);
    if(ethers.formatUnits(balance, 18) < 0.00003) {
        console.error('Not enough BTC gas');
        return;
    }
    //
    const cbdAmount = fs.readFileSync('./amount.txt', 'utf-8');
    console.log(`Your CBD balance: ${cbdAmount}`);
    const { address: address1, decimals: decimals1, symbol: symbol1 } = config.currency_in
    const { address: address2, decimals: decimals2, symbol: symbol2 } = config.currency_out
    let amountIn = undefined
    let currencyIn = undefined
    let currencyOut = undefined
    if(cbdAmount > 0) { // sell cbd buy btc
        amountIn = ethers.parseUnits(cbdAmount, 18); // amountIn: token0 amount
        currencyIn = new Token(config.chain_id, address2, decimals2, symbol2, symbol2)
        currencyOut = new Token(config.chain_id, address1, decimals1, symbol1, symbol1)
    } else { // sell btc buy cbd
        const tokenContract = new ethers.Contract(config.currency_in.address, erc20ABI, wallet);
        const balance = await tokenContract.balanceOf(wallet.address);
        console.log(`Your WBTC balance: ${ethers.formatUnits(balance, 18)}`);
        const amount = ethers.formatUnits(balance, 18) > config.amount_in ? config.amount_in : ethers.formatUnits(balance, 18);
        amountIn = ethers.parseUnits(amount); // amountIn: token0 amount
        currencyIn = new Token(config.chain_id, address1, decimals1, symbol1, symbol1)
        currencyOut = new Token(config.chain_id, address2, decimals2, symbol2, symbol2)
    }
    // Note: the second parameter of parseUnits represents the token's precision. Please confirm the precision values of the two tokens you are trading.
    const currencyInAmount = new TokenAmount(currencyIn, amountIn)
    const minAmountsOut = await getAmountsOut(currencyIn, currencyOut, currencyInAmount, currencyOut); // amountOutMin: the minimum amount of token1 you expect to receive
    // Parameter settings
    console.log("You will pay", ethers.formatUnits(amountIn, currencyIn.decimals), currencyIn.symbol);
    console.log("You will get at least ", ethers.formatUnits(minAmountsOut, currencyOut.decimals), currencyOut.symbol);

    const to = wallet.address; // recipient address (You can set it as your other address)
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Set transaction valid time (20 minutes later)
    await approveToken(routerAddress, currencyIn)

    // Execute the transaction
    const tx = await routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        minAmountsOut,
        [
            currencyIn.address,
            currencyOut.address
        ],
        to,
        deadline
    );

    console.log('Transaction hash:', tx.hash);

    // Wait for the transaction to complete
    const receipt = await tx.wait();
    // console.log('Transaction was mined in block', receipt.blockNumber);
    if(currencyOut.symbol === 'WBTC') {
        fs.writeFileSync('./amount.txt', '0');
    } else {
        fs.writeFileSync('./amount.txt', ethers.formatUnits(minAmountsOut, currencyOut.decimals));
    }
}

// Call the function to swap tokens
const times =  new Array(config.swaptime).fill(1).map((item, index) => { return index })
async function swap() {
    for(const time of times) {
        console.log(`Swap ${time + 1} times`)
        await swapTokens().catch((error) => {
            console.error('Error swapping tokens:', error);
        });
    }
}
swap()