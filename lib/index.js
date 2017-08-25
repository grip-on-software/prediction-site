import * as d3 from 'd3';
import axios from 'axios';
import spinner from './spinner';

const loadingSpinner = new spinner({
    width: d3.select('#container').node().clientWidth,
    height: 100,
    startAngle: 220,
    container: '#container',
    id: 'loading-spinner'
});
loadingSpinner.start();

// Use a local file by default
let url = 'data/data.json';

// If we're not on localhost, load the data from the API
if (location.hostname !== "localhost") {
    const server = 'http://prediction.gros.example/';
    const finalPart = window.location.pathname.split('/').filter((part) => !!part).pop();
    const project = window.location.search.substr(1) || finalPart;

    url = server + 'api/v1/predict/jira/' + project + '/sprint/latest';
}

axios.get(url).then(response => {
    let data = response.data;
    console.log(data);

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

                if (value >= 20 && value < 50) {
                    progressClass = 'is-warning';
                }
                else if (value >= 50) {
                    progressClass = 'is-danger';
                }
                element.attr('value', value).classed(progressClass, true);
            }
            else {
                element.text(data[key]);
            }
        }
    });

    d3.select('#overview').style('display', 'block');

    loadingSpinner.stop();
}).catch(function(error) {
    console.log(error);
    loadingSpinner.stop();
    d3.select('#error-message')
        .style('display', 'block')
        .text('Could not load prediction data: ' + error);
});
