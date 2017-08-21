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
                    const text = (typeof key == "number" ? data[key][subkey] :
                        subkey + ': ' + data[key][subkey]
                    );
                    element.insert('li').text(text);
                });
            }
            else if (valueElement && !valueElement.empty()) {
                element.text(valueElement.text());
            }
            else if (element.text() == '%') {
                element.text('' + (data[key] * 100) + '%');
            }
            else {
                element.text(data[key]);
            }
        }
    });

    d3.select('#overview').style('visibility', 'visible');

    loadingSpinner.stop();
}).catch(function(error) {
    console.log(error);
    loadingSpinner.stop();
    d3.select('#container').text('Could not load prediction data: ' + error);
});
