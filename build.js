var child_process = require('child_process');
var path = require('path');

var async = require('async');
var builder = require('electron-builder').init();
var fs = require('fs-extra');
var packager = require('electron-packager');
var request = require('request');
var rimraf = require('rimraf');
var unzip = require('unzip');

var pkg = require('./package.json');
var config = require('./builder.json');

exports.cleanTmp = function (callback) {
	rimraf('tmp', callback);
};

exports.cleanDist = function (callback) {
	rimraf('dist', callback);
};

exports.downloadNewest = function (callback) {
	var url = 'http://builds.appcelerator.com.s3.amazonaws.com/mobile/docs/index.json';

	console.info('Fetching list of CI builds..');
	console.info(url);

	request(url, function (error, response, body) {

		if (error || response.statusCode !== 200) {
			return callback(error || response.statusCode);
		}

		var list;

		try {
			list = JSON.parse(body);
		} catch (e) {
			return callback(e);
		}

		var newest = list.pop();
		var filepath = 'tmp/' + newest.filename;

		fs.stat(filepath, function (err, stats) {

			if (!err && stats.isFile()) {
				console.info('Skipping download because we already did.');
				return callback(null, filepath);
			}

			var url = 'http://builds.appcelerator.com.s3.amazonaws.com/mobile/docs/' + newest.filename;

			console.info('Downloading latest CI build..');
			console.info(url);

			fs.ensureDirSync(path.dirname(filepath));

			request
				.get(url)
				.on('error', callback)
				.on('end', function () {
					console.info('Extracting download..');

					fs.createReadStream(filepath)
						.on('error', callback)
						.on('end', function () {
							callback(null);
						})
						.pipe(unzip.Extract({
							path: 'tmp/app/docs'
						}));

				})
				.pipe(fs.createWriteStream(filepath));
		});
	});
};

exports.packageAll = function (callback) {

	console.info('Copying app to tmp/app..');

	fs.copy('app', 'tmp/app', function (err) {

		if (err) {
			return callback(err);
		}

		console.info('Packaging..');

		packager({
			dir: 'tmp/app',
			name: config.osx.title,
			out: 'tmp/builds',
			version: pkg.dependencies['electron-prebuilt'].substr(1),
			all: true,
			icon: 'assets/icon',
		}, function (err, packages) {

			if (err) {
				return callback(err);
			}

			fs.ensureDirSync('dist');

			console.info('Compressing linux-ia32..');

			child_process.execFile('tar', ['-czf', path.join(__dirname, 'dist', config.osx.title + ' linux-ia32.tar.gz'), config.osx.title + '-linux-ia32'], {
				cwd: 'tmp/builds'
			}, function (error, stdout, stderr) {

				if (error) {
					return callback(error);
				}

				console.info('Compressing linux-x64..');

				child_process.execFile('tar', ['-czf', path.join(__dirname, 'dist', config.osx.title + ' linux-x64.tar.gz'), config.osx.title + '-linux-x64'], {
					cwd: 'tmp/builds'
				}, function (error, stdout, stderr) {

					if (error) {
						return callback(error);
					}

					return callback();

				});

			});

		});
	});
};

exports.buildOSX = function (callback) {

	console.info('Building darwin-x64..');

	builder.build({
		appPath: path.resolve('tmp', 'builds', config.osx.title + '-darwin-x64', config.osx.title + '.app'),
		platform: 'osx',
		out: 'tmp/builds',
		config: 'builder.json'
	}, function (err, res) {

		if (err) {
			return callback(err);
		}

		fs.move(path.join('tmp', 'builds', config.osx.title + '.dmg'), path.join('dist', config.osx.title + ' darwin-x64.dmg'), callback);
	});
};

exports.buildWin32 = function (callback) {

	console.info('Building win32-ia32..');

	builder.build({
		appPath: path.resolve('tmp', 'builds', config.osx.title + '-win32-ia32'),
		platform: 'win',
		out: 'tmp/builds',
		config: 'builder.json'

	}, function (err, res) {

		if (err) {
			return callback(err);
		}

		fs.move(path.join('tmp', 'builds', config.osx.title + ' Setup.exe'), path.join('dist', config.osx.title + ' win32-ia32.exe'), callback);
	});
};

exports.buildWin64 = function (callback) {

	console.info('Building win32-x64..');

	builder.build({
		appPath: path.resolve('tmp', 'builds', config.osx.title + '-win32-x64'),
		platform: 'win',
		out: 'tmp/builds',
		config: 'builder.json'

	}, function (err, res) {

		if (err) {
			return callback(err);
		}

		fs.move(path.join('tmp', 'builds', config.osx.title + ' Setup.exe'), path.join('dist', config.osx.title + ' win32-x64.exe'), callback);
	});
};

var cmd = process.argv.slice(2);

if (cmd && exports[cmd]) {

	exports[cmd](function (err, res) {

		if (err) {
			console.error(err);
			process.exit(1);
		}

		console.info(res);
	});

} else {

	async.series([

		exports.cleanTmp,

		exports.cleanDist,

		exports.downloadNewest,

		exports.packageAll,

		exports.buildOSX,

		exports.buildWin64,

		exports.buildWin32,

		exports.cleanTmp

	], function (err, results) {

		if (err) {
			console.error(err);
			process.exit(1);
		}

		console.info('Done!');

	});
}
