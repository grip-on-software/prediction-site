import _ from 'lodash';
import * as d3 from 'd3';
import axios from 'axios';
import moment from 'moment';
import mimetype2fa from 'mimetype-to-fontawesome';
import {locale, navigation, spinner} from '@gros/visualization-ui';
import config from 'config.json';
import spec from './locale.json';

const locales = new locale(spec, config.language);

const loadingSpinner = new spinner({
    width: d3.select('#prediction-container').node().clientWidth,
    height: 100,
    startAngle: 220,
    container: '#prediction-container',
    id: 'loading-spinner'
});
loadingSpinner.start();

// Use a public-hosted file for local debugging: Single project
let projectUrl = 'data/latest.json';
let listUrl = 'data/projects.json';
let localeUrl = item => `data/${item}.json`;
config.navLink = '?project=';
let project = null;
const searchParams = new URLSearchParams(window.location.search);
locales.select(searchParams.get("lang"));

// If we are on localhost, use the local file.
// The project prediction data can be overridden using the query string,
// or disabled (index view) using 'index' as query string.
// If we're not on localhost, load the data from the prediction API.
if (location.hostname === "localhost") {
    project = searchParams.get("project");
    if (project === 'index' || project === '' || project === null) {
        projectUrl = '';
    }
    else {
        projectUrl = `data/${project}/latest.json`;
    }
}
else {
    const parts = window.location.pathname.split('/');
    const finalPart = parts.pop();
    const branchIndex = parts.lastIndexOf('branch', parts.length - 2);
    const api = config.hostname + '/api/v1' +
        (branchIndex === -1 ? '' : '-' + parts[branchIndex+1]) + '/';
    project = searchParams.get("project") ||
        (finalPart === 'index.html' ? '' : finalPart);

    projectUrl = project ? api + `predict/jira/${project}/sprint/latest` : '';
    listUrl = api + 'list/jira';
    localeUrl = item => `${api}locale/${item}`;
    config.navLink = config.hostname + parts.join('/') + '/';
}

let makeNavigation = function(projectList, currentProject) {
    // Create project navigation
    const projectNavigation = new navigation({
        container: '#navigation',
        setCurrentItem: (project, hasProject) => {
            if (project !== currentProject) {
                return false;
            }
            return true;
        },
        addElement: (element) => {
            element.text(d => d)
                .attr('href', d => {
                    const url = new URL(config.navLink + d, document.location);
                    if (locales.lang !== config.language) {
                        url.searchParams.set("lang", locales.lang);
                    }
                    return url;
                });
        }
    });
    projectNavigation.start(projectList.data.sort());
    projectNavigation.setCurrentItem(currentProject);
};

let makeContent = function(data, fallback, localization, container=d3, selector='#') {
    let displayValue = function(key, value, element) {
        var linkConfig = element.attr('data-link-config');
        var valueElement;
        try {
            valueElement = element.select(selector + key + '-' + value);
        }
        catch (e) {
            valueElement = null;
        }
        if (Array.isArray(value)) {
            var template = element.select(selector + key + '-template');
            value.forEach((item) => {
                var subelement = template.clone(true).attr('id', null);
                const itemFallback = _.assign(fallback, {
                    project: item.project_id
                });
                makeContent(item, itemFallback, localization, subelement, '.item-');
            });
            template.remove();
        }
        else if (typeof value === "object") {
            _.forIn(value, (subvalue, subkey) => {
                if (subvalue !== null) {
                    const tr = element.select('tbody').insert('tr');
                    tr.append('td').text(subkey);
                    const td = tr.append('td');
                    if (typeof subvalue === "object") {
                        td.append('ul')
                            .selectAll("li")
                            .data(subvalue)
                            .enter()
                            .append('li')
                            .text(d => subkey in localization ? locales.retrieve(localization[subkey], d) : d);
                    }
                    else {
                        td.text(subvalue);
                    }
                }
            });
        }
        else if (linkConfig !== null) {
            var linkValue = element.attr('data-link-value');
            if (data[linkValue] !== null && data[linkValue] !== undefined) {
                element.attr('href', config[linkConfig] + data[linkValue]);
            }
            element.text(value);
        }
        else if (valueElement && !valueElement.empty()) {
            container.select(selector + 'message-' + key)
                .classed(valueElement.attr('class'), true);
            element.text(valueElement.text());
        }
        else if (element.text() == '%') {
            element.text('' + (value * 100) + '%');
        }
        else if (element.classed('progress')) {
            const progressValue = value * 100;
            let progressClass = 'is-success';

            if (progressValue >= 20 && progressValue < 80) {
                progressClass = 'is-warning';
            }
            else if (progressValue >= 80) {
                progressClass = 'is-danger';
            }
            element.attr('value', progressValue)
                .text(progressValue + '%')
                .attr('title', progressValue + '%')
                .classed(progressClass, true);
        }
        else {
            var date = moment(value, "YYYY-MM-DD HH:mm:ss", true);
            if (date.isValid()) {
                element.text(date.format('ll')).attr('title', date.format());
            }
            else {
                element.text(value);
            }
        }
    };

    // Add prediction values to the page
    var shownKeys = new Set();
    Object.keys(data).forEach((key) => {
        var value = data[key] === null ? fallback[key] : data[key];
        if (value === null || value === undefined) {
            return;
        }

        const element = container.select(selector + key);
        if (!element.empty()) {
            shownKeys.add(key);
            displayValue(key, value, element);
        }
    });

    container.selectAll('[data-show]').filter(function() {
        return !shownKeys.has(this.getAttribute('data-show'));
    }).classed('is-hidden', true);
};

let makeFiles = function(data) {
    const files = data.data.files;
    let cards = d3.select('#files').selectAll('.card').data(files);
    let card = cards.enter().append('div')
        .classed('card', true);
    let cardContent = card.append('div')
        .classed('card-content', true);
    let media = cardContent.append('div')
        .classed('media', true);
    media.append('div')
        .classed('media-left', true)
        .html(d => `<i class="fa ${mimetype2fa(d.mimetype, {prefix: 'fa-'})}"></i>`);
    media.append('div')
        .classed('media-content', true)
        .html(d => `<a href="${config.hostname}/papers/${d.name}">${d.name}</a>`);
};

if (projectUrl === '') {
    axios.get(listUrl)
        .then(response => {
            makeNavigation(response);

            loadingSpinner.stop();
        })
        .catch(function(error) {
            console.log(error);
            loadingSpinner.stop();
            d3.select('#error-message')
                .classed('is-hidden', false)
                .text(locales.message("error-projects", [error]));
        });

    if (config.files) {
        axios.get(config.files).then(response => {
            d3.select('#files-title').classed('is-hidden', false);
            makeFiles(response.data);
        })
        .catch(function(error) {
            console.log(error);
            loadingSpinner.stop();
            d3.select('#files-error-message')
                .classed('is-hidden', false)
                .text(locales.message("error-files", [error]));
        });
    }
}
else {
    axios.all([
        axios.get(projectUrl),
        axios.get(listUrl),
        axios.get(localeUrl('descriptions')),
        axios.get(localeUrl('units'))
    ])
    .then(axios.spread(function (predictionData, projectList, descriptions, units) {
        let data = predictionData.data;

        makeNavigation(projectList, project);
        makeContent(data, {
            project: project,
            name: locales.message("sprint-view")
        }, {
            features: descriptions.data,
            units: units.data
        });

        d3.select('#overview').classed('is-hidden', false);
        loadingSpinner.stop();
    }))
    .catch(function(error) {
        console.log(error);
        loadingSpinner.stop();
        d3.select('#prediction-error-message')
            .classed('is-hidden', false)
            .text(locales.message("error-prediction", [error]));
    });
}

searchParams.delete("lang");
locales.generateNavigation(d3.select('#languages'), '',
    searchParams.toString() === '' ? 'lang' : `${searchParams}&lang`);
locales.updateMessages();
