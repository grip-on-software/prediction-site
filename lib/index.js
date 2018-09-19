import _ from 'lodash';
import * as d3 from 'd3';
import axios from 'axios';
import moment from 'moment';
import mimetype2fa from 'mimetype-to-fontawesome';
import {locale, navigation, navbar, spinner} from '@gros/visualization-ui';
import config from 'config.json';
import spec from './locale.json';
import {Content, predicateTypes} from './content';

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
let metaUrl = 'data/projects_meta.json';
let localeUrl = item => `data/${item}.json`;
let linksUrl = 'data/links.json';
config.navLink = '?project=';
let project = null;
let branch = 'master';
let apiUrl = (branch, item) => `data/${item}.json`;
const searchParams = new URLSearchParams(window.location.search);
const selectedLocale = locales.select(searchParams.get("lang"));
moment.locale(locales.lang);

// If we are on localhost, use the local file.
// The project prediction data can be overridden using the query string,
// or disabled (index view) using 'index' as query string.
// If we're not on localhost, load the data from the prediction API.
if (location.hostname === "localhost") {
    project = searchParams.get("project");
    if (project === 'index' || project === '' || project === null) {
        projectUrl = '';
        linksUrl = '';
    }
    else {
        projectUrl = `data/${project}/latest.json`;
        linksUrl = `data/${project}/links.json`;
    }
}
else {
    var base;
    try {
        base = new URL(config.prediction_url).pathname;
    }
    catch (e) {
        base = config.prediction_url;
    }
    const baseParts = base.split('/');
    const parts = _.dropWhile(document.location.pathname.split('/'),
        (part, index) => baseParts.length > index && baseParts[index] === part
    );
    const finalPart = parts.pop();
    const branchIndex = parts.lastIndexOf('branch', parts.length - 2);
    branch = branchIndex === -1 ? 'master' : parts[branchIndex+1];
    project = searchParams.get("project") ||
        (finalPart === 'index.html' ? '' : finalPart);
    apiUrl = (branch, item) => `${config.prediction_url}api/v1${branch === 'master' ? '' : '-' + branch}/${item}`;

    projectUrl = project ?
        apiUrl(branch, `predict/jira/${project}/sprint/latest`) : '';
    listUrl = apiUrl(branch, 'list/jira');
    metaUrl = apiUrl(branch, 'list/meta');
    localeUrl = item => apiUrl(branch, `locale/${item}`);
    linksUrl = project ? apiUrl(branch, `links/${project}/sprint/latest`) : '';
    config.navLink = config.prediction_url;
    config.navLink += parts.filter(part => part !== '').join('/');
    if (config.navLink.substr(-1) !== '/') {
        config.navLink += '/';
    }
}

let getUrl = function(project=null, branch=null) {
    const specialLinks = {
        null: config.navLink,
        "master": `${config.master_url}/`
    };
    const url = new URL(
        (specialLinks[branch] || `${config.branch_url}/${branch}/`) +
        (project === null ? '' : project),
        document.location);

    if (locales.lang !== config.language) {
        url.searchParams.set("lang", locales.lang);
    }
    return url;
};

const buildProjectFilter = function(projectNavigation, projects, currentProject, hasMetadata) {
    const isRecent = (_.find(projects,
        (project) => project.name === currentProject
    ) || {recent: hasMetadata}).recent;
    const filter = (projects) => {
        const filters = {};
        d3.selectAll('#filter input').each(function(d) {
            const checked = d3.select(this).property('checked');
            const bits = d.inverse ? [d.inverse, !checked] : [d.key, checked];
            if (bits[1]) {
                filters[bits[0]] = true;
            }
        });

        return _.filter(projects, filters);
    };

    const label = d3.select('#filter')
        .selectAll('label')
        .data([{key: 'recent', default: !!isRecent}])
        .enter()
        .append('label')
        .classed('checkbox tooltip', true)
        .attr('disabled', hasMetadata ? null : true)
        .attr('data-tooltip', d => locales.attribute("project-filter-title", d.key));
    label.append('input')
        .attr('type', 'checkbox')
        .property('checked', d => d.default)
        .attr('disabled', hasMetadata ? null : true)
        .on('change', () => {
            projectNavigation.update(filter(projects));
        });
    label.append('span')
        .text(d => locales.attribute("project-filter", d.key));

    return filter(projects);
};

let makeNavigation = function(projectList, projectMeta, currentProject) {
    // Create project navigation
    const projectNavigation = new navigation({
        container: '#navigation',
        setCurrentItem: (project, hasProject) => {
            if (project !== currentProject) {
                return false;
            }
            return true;
        },
        key: d => d.name,
        addElement: (element) => {
            element.classed('tooltip', true)
                .style("width", "0%")
                .style("opacity", "0")
                .text(d => d.name)
                .attr('href', d => getUrl(d.name))
                .attr('data-tooltip', d => locales.message("project-title",
                    [d.quality_display_name || d.name]
                ))
                .transition()
                .style("width", "100%")
                .style("opacity", "1");
        },
        removeElement: (element) => {
            element.transition()
                .style("opacity", "0")
                .remove();
        }
    });

    // Build list of projects with metadata
    const hasMetadata = !_.isEmpty(projectMeta);
    const projectData = hasMetadata ?
        _.intersectionBy(projectMeta, projectList,
            (project) => project.name ? project.name : project
        ) :
        _.zipWith(projectList, key => {
            return {name: key};
        });
    const projects = buildProjectFilter(projectNavigation, projectData,
        currentProject, hasMetadata
    );

    projectNavigation.start(projects);
    projectNavigation.setCurrentItem(currentProject);
};

let makeContent = function(context) {
    let displayValue = function(key, value, element, context) {
        const type = (_.find(predicateTypes,
            (predicate) => predicate[0](value, element, key, context)
        ) || [null, Content])[1];

        const content = new type(key, value, element, context);
        return content.display();
    };

    context = _.assign({}, {
        container: d3,
        selector: '#',
        config, locales, moment,
        formatLocale: d3.formatLocale(selectedLocale),
        build: makeContent,
        display: displayValue
    }, context);

    // Add prediction values to the page
    var shownKeys = new Set();
    _.forOwn(context.data, (value, key) => {
        if (typeof context.fallback[key] === "function") {
            value = context.fallback[key](value);
        }
        else if (value === null) {
            value = context.fallback[key];
        }

        if (value === null || value === undefined) {
            return;
        }

        const element = context.container.select(context.selector + key);
        if (!element.empty() && context.display(key, value, element, context)) {
            shownKeys.add(key);
        }
    });

    context.container.selectAll('[data-show]').filter(function() {
        return !shownKeys.has(this.getAttribute('data-show'));
    }).classed('is-hidden', true);
};

let updateFileIcon = function(icon) {
    return icon.replace(/-o$/, '').replace(/-text$/, '-alt');
};

let makeFiles = function(data) {
    const files = data.data.files.filter(file => file.type !== 'dir');
    let cards = d3.select('#files').selectAll('.card').data(files);
    let card = cards.enter().append('div')
        .classed('card', true);
    let cardContent = card.append('div')
        .classed('card-content', true);
    let media = cardContent.append('div')
        .classed('media', true);
    media.append('div')
        .classed('media-left', true)
        .html(d => `<i class="far ${updateFileIcon(mimetype2fa(d.mimetype, {prefix: 'fa-'}))}"></i>`);
    media.append('div')
        .classed('media-content', true)
        .html(d => `<a href="${config.prediction_url}papers/${d.name}">${d.name}</a>`);
};

let addBranchConfiguration = function(descriptions, data, d, branch) {
    const labels = Array.isArray(data.labels) ? data.labels : [data.labels];
    const id = `branch-${data.model}-${labels.join('-')}`;
    const modelBranch = d3.select(`#${id}`);

    branch.select('span.branch')
        .text(locales.attribute('model', data.model));

    if (data.labels) {
        branch.append('span')
            .text(locales.message('branch-labels', [
                _.map(labels, label => locales.retrieve(descriptions, label)).join(', ')
            ]));
    }

    if (d.name === "master") {
        branch.append('span')
            .text(locales.message('branch-default'));
    }
    else if (!modelBranch.empty()) {
        const addName = branch => {
            branch.append('span')
                .classed('name', true)
                .text(d => locales.message('branch-same-name', [d.name]));
        };
        addName(branch);

        if (modelBranch.select('.name').empty()) {
            addName(modelBranch);
        }
    }
    else {
        branch.attr('id', id);
    }
};

let makeBranches = function(descriptions, target=null) {
    if (config.branches_url) {
        axios.get(config.branches_url)
            .then(response => {
                const branches = d3.select('#branches').selectAll('dropdown-item')
                    .data(response.data.jobs);
                const items = branches.enter().append('a')
                    .classed('dropdown-item', true)
                    .classed('is-active', d => d.name === branch)
                    .attr('href', d => getUrl(project, d.name));
                items.append('i')
                    .classed('fas', true)
                    .classed('fa-flask', true);
                items.append('span')
                    .classed('branch', true)
                    .text(d => d.name);
                items.each(function(d) {
                        axios.get(apiUrl(d.name, 'configuration'))
                            .then(configuration => {
                                addBranchConfiguration(descriptions,
                                    configuration.data, d, d3.select(this)
                                );
                            });
                    });
                let dropdown = d3.select('#branches-dropdown');
                if (target !== null) {
                    target.append(() => dropdown.remove().node());
                }
                dropdown.classed('is-hidden', false);
                dropdown.select('.dropdown-trigger').on('click', () => {
                    let active = !dropdown.classed('is-active');
                    dropdown.classed('is-active', active);
                    dropdown.select('.dropdown-trigger button')
                        .classed('is-outlined', !active);
                    dropdown.select('.dropdown-trigger .icon i')
                        .classed('fa-angle-up', active)
                        .classed('fa-angle-down', !active);
                });
            })
            .catch((error) => {
                throw error;
            });
    }
};

let makePage = function(projectList, projectMeta, project, data, localization, links) {
    makeNavigation(projectList, projectMeta, project);
    makeBranches(localization.descriptions || {},
        d3.select("#branches-target")
    );
    makeContent({
        data,
        fallback: {
            project: project,
            name: locales.message("sprint-view"),
            features: (values) => _.pick(values, data.configuration.features)
        },
        localization: Object.assign({}, {
            features: {},
            sources: {},
            tags: {},
            units: {},
            short_units: {}
        }, localization),
        links
    });

    d3.select('#overview').classed('is-hidden', false);
    loadingSpinner.stop();
};

if (projectUrl === '') {
    const promises = [];

    // Build the navigation
    promises.push(axios.get(listUrl)
        .then(list => {
            axios.get(metaUrl)
                .then(meta => {
                    makeNavigation(list.data, meta.data);
                })
                .catch(function(error) {
                    makeNavigation(list.data, []);
                });
        })
        .catch(function(error) {
            loadingSpinner.stop();
            d3.select('#error-message')
                .classed('is-hidden', false)
                .text(locales.message("error-projects", [error]));
        }));

    promises.push(axios.get(localeUrl('descriptions'))
        .then(descriptions => {
            makeBranches(descriptions.data);
        })
        .catch(function(error) {
            makeBranches({});
        }));

    if (config.files_url) {
        promises.push(axios.get(config.files_url)
            .then(response => {
                d3.select('#files-title').classed('is-hidden', false);
                makeFiles(response.data);
            })
            .catch(function(error) {
                d3.select('#files-error-message')
                    .classed('is-hidden', false)
                    .text(locales.message("error-files", [error]));
            }));
    }

    axios.all(promises).then(() => {
        loadingSpinner.stop();
    }).catch(function (error) {
        loadingSpinner.stop();
        throw error;
    });
}
else {
    axios.all([
        axios.get(projectUrl),
        axios.get(listUrl)
    ])
    .then(axios.spread(function (predictionData, projectList) {
        const data = predictionData.data;

        axios.all([
            axios.get(metaUrl),
            axios.get(localeUrl('descriptions')),
            axios.get(localeUrl('sources')),
            axios.get(localeUrl('tags')),
            axios.get(localeUrl('units')),
            axios.get(localeUrl('short_units')),
            axios.get(linksUrl)
        ])
        .then(axios.spread(function (meta, descriptions, sources, tags, units, short_units, links) {
            makePage(projectList.data, meta.data, project, data, {
                features: descriptions.data,
                sources: sources.data,
                tags: tags.data,
                units: units.data,
                short_units: short_units.data
            }, links.data);
        }))
        .catch(function(error) {
            makePage(projectList.data, [], project, data, {}, {});
        });
    }))
    .catch(function(error) {
        loadingSpinner.stop();
        d3.select('#prediction-error-message')
            .classed('is-hidden', false)
            .text(locales.message("error-prediction", [error]));
        throw error;
    });
}

locales.updateMessages(d3.select('body'), ["data-tooltip", "title"]);

searchParams.delete("lang");
window.buildNavigation(navbar, locales, _.assign({}, config, {
    language_query: searchParams.toString() === '' ? 'lang' : `${searchParams}&lang`
}));
