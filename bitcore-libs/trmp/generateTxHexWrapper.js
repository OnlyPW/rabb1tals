const { generateTransactionHex } = require('./generateTxHex');

// Read input from stdin
let input = '';
process.stdin.on('data', chunk => {
    input += chunk;
});

process.stdin.on('end', async () => {
    try {
        // Parse the input data
        const data = JSON.parse(input);
        
        // Generate the transaction hex
        const txHex = await generateTransactionHex(
            data.walletData,
            data.receivingAddress,
            data.amount,
            data.fee
        );
        
        // Output the result
        console.log(JSON.stringify({ txHex }));
        process.exit(0);
    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}); 