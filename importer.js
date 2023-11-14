const typeorm = require("typeorm");
const { MeiliSearch } = require('meilisearch')
const fs = require('fs');
const yaml = require('js-yaml');
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');
const { program } = require('commander');

program
	.name('node importer.js')
	.description('A utility to import past posts from Misskey into Meilisearch')
	.version('1.0.0')
	.option('--config <file>', 'path of Misskey config file (.config/default.yml)')
	.option('--id <aid>', 'starts processing from the specified "aid" sequence')
	.option('--batch-size <size>', 'number of notes to import in one process', 1000)
	.parse();

const options = program.opts();

const configFilename = options.config ?? '../misskey/.config/default.yml';

const config = (() => {
	try {
		return yaml.load(fs.readFileSync(configFilename, 'utf8'))
	} catch(e) {
		console.error('Misskey config file reading failed.');
		process.exit(1);
	}
})();

if (config.id != 'aid') {
	console.error('Id format must be "aid".');
	process.exit(1);
}

if (!config.meilisearch) {
	console.error("Meilisearch settings are not enabled.");
	process.exit(1);
}

const bar = new cliProgress.SingleBar({
	format: 'Importing |' + colors.cyan('{bar}') + '| {percentage}% | {value}/{total} Chunks | {lastId} ',
	barCompleteChar: '\u2588',
	barIncompleteChar: '\u2591',
	hideCursor: true
});

const meilisearch = new MeiliSearch({
	host: `${config.meilisearch.ssl ? 'https' : 'http' }://${config.meilisearch.host}:${config.meilisearch.port}`,
	apiKey: config.meilisearch.apiKey,
});

const meilisearchNoteIndex = meilisearch.index(`${config.meilisearch.index}---notes`);
const meilisearchIndexScope = config.meilisearch?.scope ?? 'local';

const dataSource = new typeorm.DataSource({
	type: "postgres",
	host: config.db.host,
	port: config.db.port,
	username: config.db.user,
	password: config.db.pass,
	database: config.db.db,
	synchronize: false,
});

dataSource
	.initialize()
	.then(async connection => {
		addFunction_Base36Decode(connection);
		importNotes(connection, options.id);
	}).catch((e) => {
		console.error("Error: ", e);
		process.exit(1);
	});

const importNotes = async (connection, id) => {
	const query = connection.createQueryBuilder()
		.from('note')
		.where("(text IS NOT NULL OR cw IS NOT NULL) AND visibility IN ('home', 'public')")
		.andWhere(() => {
			switch (meilisearchIndexScope) {
				case 'global': return 'true';
				case 'local':  return '"userHost" IS NULL';
				default:       return '"userHost" IN (:...hosts)';
			}
		})
		.setParameter('hosts', meilisearchIndexScope);

	let lastId = id;

	console.log('Preparing for import...');
	const { total } = await query
		.andWhere(lastId ? 'id < :id' : 'true')
		.setParameter('id', lastId)
		.select("count(*)", 'total')
		.getRawOne();

	bar.start(total, 0, { lastId: lastId ?? '(all)' });

	while (true) {
		notes = await query
			.orderBy('id', 'DESC')
			.andWhere(lastId ? 'id < :id' : 'true')
			.setParameter('id', lastId)
			.select(['id', 'base36_decode(substring(id, 1, 8))+946684800000 AS "createdAt"', '"userHost"', '"channelId"', 'cw', 'text', 'tags'])
			.take(options.batchSize)
			.getRawMany();

		if (notes.length == 0) {
			break;
		}

		await meilisearchNoteIndex.addDocuments(notes, { primaryKey: 'id' });

		lastId = notes[notes.length - 1].id;

		bar.increment(notes.length, { lastId });
	}

	bar.update(total, { lastId: '(done)'} );
	bar.stop();
};

const addFunction_Base36Decode = (connection) => {
	connection.query(`
		CREATE OR REPLACE FUNCTION base36_decode(IN base36 varchar)
		RETURNS bigint AS $$
			DECLARE
				a char[];
				ret bigint;
				i int;
				val int;
				chars varchar;
			BEGIN
			chars := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

			FOR i IN REVERSE char_length(base36)..1 LOOP
				a := a || substring(upper(base36) FROM i FOR 1)::char;
			END LOOP;
			i := 0;
			ret := 0;
			WHILE i < (array_length(a,1)) LOOP
				val := position(a[i+1] IN chars)-1;
				ret := ret + (val * (36 ^ i));
				i := i + 1;
			END LOOP;

			RETURN ret;

		END;
		$$ LANGUAGE 'plpgsql' IMMUTABLE;
	`);
};
