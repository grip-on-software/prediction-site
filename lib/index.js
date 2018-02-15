import * as d3 from 'd3';
import axios from 'axios';
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
let navLink = '?';
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
    navLink = config.hostname + '/show/';
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
        .attr('href', d => navLink + d)
        .text(d => d);
};

let makeContent = function(data, fallback) {
    // Add prediction values to the page
    Object.keys(data).forEach((key) => {
        const element = d3.select('#' + key);
        if (!element.empty()) {
            var value = data[key] === null ? fallback[key] : data[key];
            var linkConfig = element.attr('data-link-config');
            var valueElement;
            try {
                valueElement = element.select('#' + key + '-' + value);
            }
            catch (e) {
                valueElement = null;
            }
            if (typeof value === "object") {
                Object.keys(value).forEach((subkey) => {
                    if (typeof value[subkey] !== "object") {
                        const tr = element.select('tbody').insert('tr');
                        tr.append('td').text(subkey);
                        tr.append('td').text(value[subkey]);
                    }
                });
            }
            else if (linkConfig !== null) {
                var linkValue = element.attr('data-link-value');
                element.attr('href', config[linkConfig] + data[linkValue]);
                element.text(value);
            }
            else if (valueElement && !valueElement.empty()) {
                element.text(valueElement.text());

                let messageClass = 'is-success';
                if (value !== 0) {
                    messageClass = 'is-warning';
                }
                d3.select('.' + 'prediction').classed(messageClass, true);
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
                element.text(value);
            }
        }
    });

    d3.select('#overview').classed('is-hidden', false);
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
