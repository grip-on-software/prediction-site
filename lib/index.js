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
let listUrl = 'data/list.json';

// If we are on localhost, use the local file.
// The project prediction data can be overridden using the query string,
// or disabled (index view) using 'index' as query string.
// If we're not on localhost, load the data from the prediction API.
if (location.hostname === "localhost") {
    projectUrl = window.location.search.substr(1) || projectUrl;
    if (projectUrl === 'index') {
        projectUrl = '';
    }
}
else {
    const api = config.hostname + '/api/v1/';
    const finalPart = window.location.pathname.split('/').pop();
    const project = window.location.search.substr(1) || finalPart;

    projectUrl = project ? api + 'predict/jira/' + project + '/sprint/latest' : '';
    listUrl = api + 'list/jira';
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
        .attr('href', d => config.hostname + 'show/' + d)
        .text(d => d);
};

let makeContent = function(data) {
    // Add prediction values to the page
    Object.keys(data).forEach((key) => {
        const element = d3.select('#' + key);
        if (!element.empty()) {
            var valueElement;
            try {
                valueElement = element.select('#' + key + '-' + data[key]);
            }
            catch (e) {
                valueElement = null;
            }
            if (typeof data[key] == "object") {
                Object.keys(data[key]).forEach((subkey) => {
                    const tr = element.select('tbody').insert('tr');
                    tr.append('td').text(subkey);
                    tr.append('td').text(data[key][subkey]);
                });
            }
            else if (valueElement && !valueElement.empty()) {
                element.text(valueElement.text());

                let messageClass = 'is-success';
                if (data[key] !== 0) {
                    messageClass = 'is-warning';
                }
                d3.select('.' + 'prediction').classed(messageClass, true);
            }
            else if (element.text() == '%') {
                element.text('' + (data[key] * 100) + '%');
            }
            else if (element.classed('progress')) {
                const value = data[key] * 100;
                let progressClass = 'is-success';

                if (value >= 20 && value < 80) {
                    progressClass = 'is-warning';
                }
                else if (value >= 80) {
                    progressClass = 'is-danger';
                }
                element.attr('value', value)
                    .text(value + '%')
                    .attr('title', value + '%')
                    .classed(progressClass, true);
            }
            else {
                element.text(data[key]);
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

            makeNavigation(projectList, data.project);
            makeContent(data);

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
