const TextIndexer = require('./textIndexer');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

async function main() {
    const argv = yargs(hideBin(process.argv))
        .option('update', {
            alias: 'u',
            type: 'boolean',
            description: 'Update the index before searching'
        })
        .option('query', {
            alias: 'q',
            type: 'string',
            description: 'Search query'
        })
        .option('results', {
            alias: 'r',
            type: 'number',
            default: 3,
            description: 'Number of results to return'
        })
        .help()
        .argv;

    try {
        const indexer = new TextIndexer();
        await indexer.initialize();

        if (argv.update) {
            console.log('Updating index...');
            await indexer.updateIndex('data');
            console.log('Index updated successfully!');
        }

        if (argv.query) {
            console.log(`\nSearching for: ${argv.query}`);
            const results = await indexer.search(argv.query, argv.results);

            console.log('\nResults:');
            for (const { score, text } of results) {
                console.log(`\nScore: ${score.toFixed(4)}`);
                console.log(`Text: ${text}`);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);