# Misskey Meilisearch Importer

A utility to import past posts from Misskey into Meilisearch

## What is this?

This utility is used to import notes prior to the introduction of Meilisearch in order to make them searchable.

If some time has passed since the introduction, this utility will target all notes by default, so please specify the `aid` of the starting post with the `--id` option.

If the process is interrupted in the middle, you can continue by specifying the `aid` that has already been imported, which will appear at the end of the progress bar.

## Usage

```
Usage: node importer.js [options]

A utility to import past posts from Misskey into Meilisearch

Options:
  -V, --version    output the version number
  --config <file>  path of Misskey config file (.config/default.yml)
  --id <aid>       starts processing from the specified "aid" sequence
  --batch-size <size>  number of notes to import in one process (default: 1000)
  -h, --help       display help for command
```

```
node importer.js --config /home/misskey/.config/default.yml --id 9dakcx1con
```

## Setup

It is intended to work with Misskey 2023.11.

It is convenient to install under one of the Misskey installed directories (ex. /home/misskey).

You can install it anywhere you want, as long as you have access to Misskey's configuration file (a duplicate is fine), database, and Meilisearch. Use the `--config` option to specify the full path to the configuration file, assuming you have the same Node.js and pnpm installed that are required for Misskey to work.

```
cd /home/misskey

git clone https://github.com/noellabo/misskey_meilisearch_importer.git
cd misskey_meilisearch_importer

pnpm install
```
