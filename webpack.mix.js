/**
 * Entry point for laravel-mix/webpack compilation.
 *
 * Copyright 2017-2020 ICTU
 * Copyright 2017-2022 Leiden University
 * Copyright 2017-2023 Leon Helwerda
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const fs = require('fs'),
      path = require('path'),
      mix = require('laravel-mix'),
      _ = require('lodash'),
      HtmlWebpackPlugin = require('html-webpack-plugin');

let config = process.env.PREDICTION_CONFIGURATION;
if (config === undefined || !fs.existsSync(config)) {
    config = path.resolve(__dirname, 'config.json');
}
if (!fs.existsSync(config)) {
    config = path.resolve(__dirname, 'lib/config.json');
}

// Special case for some configuration keys to keep the $organization in the
// value when building a combined visualization.
const combinedConfig = new Set(["prediction_url", "branch_url", "master_url"]);
const replaceParams = (value, key, combined=true) => {
    if (process.env.VISUALIZATION_COMBINED === "true" && combined) {
        return value.replace(/\/\$organization/g, combinedConfig.has(key) ?
            "/combined/$organization" : "/combined");
    }
    return value.replace(/(\/)?\$organization/g,
        typeof process.env.VISUALIZATION_ORGANIZATION !== 'undefined' ?
        "$1" + process.env.VISUALIZATION_ORGANIZATION : ''
    );
};

const testConfiguration = {
    "branches_filter": "",
    "branches_url": (configuration) => `${configuration.prediction_url}branches`,
    "files_url": (configuration) => `${configuration.prediction_url}files`,
    "papers_url": (configuration) => `${configuration.prediction_url}papers`
};
const configuration = _.mapValues(JSON.parse(fs.readFileSync(config)),
    (value, key, object) => {
        if (process.env.NODE_ENV === "test" && _.has(testConfiguration, key)) {
            value = _.isFunction(testConfiguration[key]) ?
                testConfiguration[key](object) : testConfiguration[key];
        }
        if (key === "organizations") {
            return value;
        }
        if (_.isString(value)) {
            return replaceParams(value, key);
        }
        if (process.env.VISUALIZATION_COMBINED === "true" && value.combined) {
            return replaceParams(value.combined, key, false);
        }
        if (typeof process.env.VISUALIZATION_ORGANIZATION !== 'undefined' &&
            value[process.env.VISUALIZATION_ORGANIZATION]
        ) {
            return replaceParams(value[process.env.VISUALIZATION_ORGANIZATION],
                key
            );
        }
        return replaceParams(value.default ? value.default : value, key);
    }
);
configuration.combined = process.env.VISUALIZATION_COMBINED === "true";
const configAlias = path.resolve(__dirname, 'config-alias.json');
fs.writeFileSync(configAlias, JSON.stringify(configuration));

Mix.paths.setRootPath(__dirname);
mix.setPublicPath('public/')
    .setResourceRoot('')
    .js('lib/index.js', 'public/bundle.js')
    .sass('res/main.scss', 'public/main.css')
    .browserSync({
        proxy: false,
        server: 'public',
        files: [
            'public/**/*.js',
            'public/**/*.css'
        ]
    })
    .babelConfig({
        "env": {
            "test": {
                "plugins": [ "istanbul" ]
            }
        }
    })
    .webpackConfig({
        devtool: 'source-map',
        output: {
            path: path.resolve('public/'),
            publicPath: configuration.path
        },
        module: {
            rules: [ {
                test: /\.mustache$/,
                loader: 'mustache-loader',
                options: {
                    tiny: true,
                    render: Object.assign({}, configuration)
                }
            } ]
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: 'template/index.mustache',
                inject: 'body'
            })
        ],
        resolve: {
            alias: {
                'config.json$': configAlias
            }
        }
    });

// Full API
// mix.js(src, output);
// mix.react(src, output); <-- Identical to mix.js(), but registers React Babel compilation.
// mix.extract(vendorLibs);
// mix.sass(src, output);
// mix.less(src, output);
// mix.stylus(src, output);
// mix.browserSync('my-site.dev');
// mix.combine(files, destination);
// mix.babel(files, destination); <-- Identical to mix.combine(), but also includes Babel compilation.
// mix.copy(from, to);
// mix.copyDirectory(fromDir, toDir);
// mix.minify(file);
// mix.sourceMaps(); // Enable sourcemaps
// mix.version(); // Enable versioning.
// mix.disableNotifications();
// mix.setPublicPath('path/to/public');
// mix.setResourceRoot('prefix/for/resource/locators');
// mix.autoload({}); <-- Will be passed to Webpack's ProvidePlugin.
// mix.webpackConfig({}); <-- Override webpack.config.js, without editing the file directly.
// mix.then(function () {}) <-- Will be triggered each time Webpack finishes building.
// mix.options({
//   extractVueStyles: false, // Extract .vue component styling to file, rather than inline.
//   processCssUrls: true, // Process/optimize relative stylesheet url()'s. Set to false, if you don't want them touched.
//   purifyCss: false, // Remove unused CSS selectors.
//   uglify: {}, // Uglify-specific options. https://webpack.github.io/docs/list-of-plugins.html#uglifyjsplugin
//   postCss: [] // Post-CSS options: https://github.com/postcss/postcss/blob/master/docs/plugins.md
// });
