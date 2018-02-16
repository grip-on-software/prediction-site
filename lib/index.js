import * as d3 from 'd3';
import axios from 'axios';
import moment from 'moment';
import mimetype2fa from 'mimetype-to-fontawesome';
import spinner from './spinner';
import config from 'config.json';

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
config.navLink = '?';
let project = null;

// If we are on localhost, use the local file.
// The project prediction data can be overridden using the query string,
// or disabled (index view) using 'index' as query string.
// If we're not on localhost, load the data from the prediction API.
if (location.hostname === "localhost") {
    project = window.location.search.substr(1);
    if (project === 'index' || project === '') {
        projectUrl = '';
    }
    else {
        projectUrl = 'data/' + project + '/latest.json';
    }
}
else {
    const parts = window.location.pathname.split('/');
    const finalPart = parts.pop();
    const branchIndex = parts.lastIndexOf('branch', parts.length - 2);
    const api = config.hostname + '/api/v1' +
        (branchIndex === -1 ? '' : '-' + parts[branchIndex+1]) + '/';
    project = window.location.search.substr(1) ||
        (finalPart === 'index.html' ? '' : finalPart);

    projectUrl = project ? api + 'predict/jira/' + project + '/sprint/latest' : '';
    listUrl = api + 'list/jira';
    config.navLink = config.hostname + parts.join('/') + '/';
}

let makeNavigation = function(projectList, currentProject) {
    // Create project navigation
    d3.select('#navigation ul')
        .selectAll('li')
        .data(projectList.data.sort())
        .enter()
        .append('li')
        .classed('is-active', d => d === currentProject)
        .append('a')
        .attr('href', d => config.navLink + d)
        .text(d => d);
};


let makeContent = function(data, fallback, container=d3, selector='#') {
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
            console.log(template);
            value.forEach((item) => {
                var subelement = template.clone(true).attr('id', null);
                makeContent(item, fallback, subelement, '.item-');
            });
            template.remove();
        }
        else if (typeof value === "object") {
            Object.keys(value).forEach((subkey) => {
                if (value[subkey] !== null) {
                    const tr = element.select('tbody').insert('tr');
                    tr.append('td').text(subkey);
                    const td = tr.append('td');
                    if (typeof value[subkey] === "object") {
                        td.append('ul')
                            .selectAll("li")
                            .data(value[subkey])
                            .enter()
                            .append('li')
                            .text(d => d);
                    }
                    else {
                        td.text(value[subkey]);
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
                .attr('class', valueElement.attr('class'));
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
                .text('Could not load projects list: ' + error);
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
                .text('Could not load files list: ' + error);
        });
    }
}
else {
    axios.all([axios.get(projectUrl), axios.get(listUrl)])
        .then(axios.spread(function (predictionData, projectList) {
            let data = predictionData.data;

            makeNavigation(projectList, project);
            makeContent(data, {
                project: project,
                name: "View sprint (if you have access)"
            });

            d3.select('#overview').classed('is-hidden', false);
            loadingSpinner.stop();
        }))
        .catch(function(error) {
            console.log(error);
            loadingSpinner.stop();
            d3.select('#prediction-error-message')
                .classed('is-hidden', false)
                .text('Could not load prediction data: ' + error);
        });
}
