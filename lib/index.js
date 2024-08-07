/**
 * Main entry point for the prediction site.
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
import _ from 'lodash';
import * as d3 from 'd3';
import axios from 'axios';
import moment from 'moment';
import mimetype2fa from 'mimetype-to-fontawesome';
import {Locale, Navigation, Navbar, Spinner} from '@gros/visualization-ui';
import config from 'config.json';
import spec from './locale.json';
import {Content, predicateTypes} from './Content';

const ATTR_TOOLTIP = "data-tooltip";
const ATTR_LABEL = "aria-label";

const locales = new Locale(spec, config.language);

const loadingSpinner = new Spinner({
    width: d3.select('#prediction-container').node().clientWidth,
    height: 100,
    startAngle: 220,
    container: '#prediction-container',
    id: 'loading-spinner'
});
loadingSpinner.start();

// Use hosted files for local debugging (see "localhost" branch)
let dataUrl, listUrl, metaUrl, linksUrl, sourcesUrl, sprintsUrl;
let localeUrl = item => `data/${item}.json`;
let datasetUrl = 'data/sprint_features.arff';
config.navLink = '?project=';
config.sprintLink = '&sprint=';

const searchParams = new URLSearchParams(document.location.search);
let project = searchParams.get("project");
let sprint = searchParams.get("sprint") || 'latest';
let branch = searchParams.get("branch") || 'master';
let organization = searchParams.get("organization");
let apiUrl = (branch, item) => `data/${item}.json`;
let predictionUrl = config.prediction_url;
let combined = searchParams.has("combined") ?
    searchParams.get("combined") === "true" : config.combined;

const selectedLocale = locales.select(searchParams.get("lang"));
moment.locale(locales.lang);

// If we are on localhost, use the local files.
// The project prediction data can be overridden using the query string,
// or disabled (index view) using 'index' as query string.
// If we're not on localhost, load the data from the prediction API.
if (document.location.hostname === "localhost") {
    if (combined && organization !== '' && organization !== null) {
        apiUrl = (branch, item) => `data/${organization}/${item}.json`;
        localeUrl = item => `data/${organization}/${item}.json`;
    }
    listUrl = apiUrl(branch, 'projects');
    metaUrl = apiUrl(branch, 'projects_meta');

    /* istanbul ignore next */
    if (project === 'index' || project === '' || project === null) {
        dataUrl = '';
        linksUrl = '';
        sourcesUrl = '';
        sprintsUrl = '';
    }
    else {
        dataUrl = apiUrl(branch, `${project}/${sprint}`);
        const suffix = (sprint === 'latest' ? '' : `.${sprint}`);
        linksUrl = apiUrl(branch, `${project}/links${suffix}`);
        sourcesUrl = apiUrl(branch, `${project}/sources`);
        sprintsUrl = apiUrl(branch, `${project}/sprints`);
    }
}
else {
    // Determine portions of the URL path (normalized for double slashes):
    // - The base of the prediction site, which is based on the configuration
    // - The prefix, which is based on the current URL and the prediction site
    //   base, taking parts of the URL path until it no longer matches the base,
    //   but adjusts for combined organization template in the configuration
    // - The trailer, which is the remainder of the URL path after the prefix
    // - The final part, which is the last part of the trailer after removing
    //   a sprint indicator from it
    // - The branch, which is a part after a branch indicator somewhere in the
    //   trailer
    // - The project, which is the final part unless that is set to "index.html"
    //   (which may happen in some rewrite schemes)
    // - The sprint, which is either the sprint indicator that is removed from
    //   the trailer or "latest"
    let base;
    try {
        base = new URL(predictionUrl).pathname;
    }
    catch (e) {
        base = predictionUrl;
    }
    const baseParts = base.split('/');
    const url = document.location.pathname.replace('//', '/');
    const parts = url.split('/');
    const prefix = _.takeWhile(parts,
        (part, index) => baseParts.length > index &&
            (baseParts[index] === part || (index > 0 &&
                `/${baseParts[index - 1]}/${baseParts[index]}` === "/combined/$organization"))
    );
    const trailer = _.slice(parts, prefix.length);
    if (trailer[trailer.length - 2] === 'sprint') {
        sprint = trailer.pop();
        trailer.pop();
    }
    const finalPart = trailer.pop();
    const branchIndex = trailer.lastIndexOf('branch', trailer.length - 2);
    if (branchIndex !== -1) {
        branch = trailer[branchIndex + 1];
    }
    if (project === null || project === '') {
        project = finalPart === 'index.html' ? '' : finalPart;
    }
    if (sprint === null || sprint === '') {
        sprint = "latest";
    }

    // Set the organization based on the prefix part that matched the
    // $organization variable from the base URL from configuration, including
    // some sanity checks to avoid setting it to an unrelated part
    if (organization === null || organization === '') {
        const organizationIndex = baseParts.indexOf("$organization", 1);
        organization = organizationIndex !== -1 ? parts[organizationIndex] : "";
        if (parts[organizationIndex] === "prediction") {
            organization = "";
        }
    }
    // Determine combined prediction from URL.
    combined = baseParts.indexOf("combined") !== -1;

    // Use the original prediction URL (may contain an $organization variable
    // for combined predictions) in the navLink since getUrl may replace it
    config.navLink = predictionUrl;
    config.navLink += trailer.filter(part => part !== '').join('/');
    if (config.navLink.substr(-1) !== '/') {
        config.navLink += '/';
    }
    config.sprintLink = '/sprint/';
    if (!config.branch_url.includes('$branch')) {
        config.branch_url += '/$branch';
    }

    // Update the prediction URL to contain the current organization if one was
    // detected from the URL parts
    predictionUrl = predictionUrl.replace(/\/\$organization/g,
        organization ? `/${organization}` : ""
    );

    // Set the API URLs
    apiUrl = (branch, item) => {
        const version = (branch === 'master' ? '' : `-${branch}`);
        return `${predictionUrl}api/v1${version}/${item}`;
    };
    dataUrl = project ?
        apiUrl(branch, `predict/jira/${project}/sprint/${sprint}`) : '';
    listUrl = apiUrl(branch, 'list/jira');
    metaUrl = apiUrl(branch, 'list/meta');
    sourcesUrl = project ? apiUrl(branch, `links/${project}`) : '';
    localeUrl = item => apiUrl(branch, `locale/${item}`);
    linksUrl = project ? apiUrl(branch, `links/${project}/sprint/${sprint}`) : '';
    sprintsUrl = project ? apiUrl(branch, `predict/jira/${project}/sprints`) : '';
    datasetUrl = apiUrl(branch, 'dataset');
}

const branchUrl = function(branch) {
    const specialLinks = {
        "master": config.master_url
    };
    const url = new URL(_.get(specialLinks, branch,
        config.branch_url.replace(/\$branch/g, branch)
    ), document.location);
    if (url.search === '') {
        return `${url.pathname}/`;
    }
    return `${url.pathname}${url.search}`;
};

/* Create URL for a certain organization, branch, project and/or sprint */
const getUrl = function(params) {
    const base = params.branch ? branchUrl(params.branch) : config.navLink;
    const org = params.organization || organization;
    const orgBase = base.replace(/\/\$organization/g, org ? `/${org}` : "");
    const sprintLink = params.sprint ? `${config.sprintLink}${params.sprint}` :
        "";
    const url = new URL(`${orgBase}${params.project || ""}${sprintLink}`,
        document.location
    );

    // For localhost-based combined data sets or setups not using all rewrite
    // rules from visualization-site, we do not have the $organization variable
    // within the URL to replace, instead propagate the information through URL
    // search parameters
    if (orgBase === base) {
        if (document.location.hostname === "localhost") {
            url.searchParams.set("combined", combined ? "true" : "");
        }
        if (org !== null && org !== '') {
            url.searchParams.set("organization", org);
        }
    }

    // Propagate selected language in the search parameter
    if (locales.lang !== config.language) {
        url.searchParams.set("lang", locales.lang);
    }
    return url;
};

/* Create selection boxes for filtering the project navigation */
const buildProjectFilter = function(projectNavigation, projects, currentProject, hasMetadata) {
    if (projects.length === 0 || (hasMetadata &&
        _.every(projects, (project) => project.recent === projects[0].recent)
    )) {
        return projects;
    }
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
        .attr(ATTR_TOOLTIP,
            d => locales.attribute("project-filter-title", d.key)
        );
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

/* Create project navigation */
const makeProjectNavigation = function(projectList, currentProject) {
    const projectNavigation = new Navigation({
        container: '#navigation',
        prefix: 'project_',
        isActive: project => project === currentProject,
        setCurrentItem: (project, hasProject) => {
            if (project !== currentProject) {
                return false;
            }
            return true;
        },
        key: d => d.name,
        addElement: (element) => {
            element.classed('tooltip has-tooltip-multiline has-tooltip-center', true)
                .style("width", "0%")
                .style("opacity", "0")
                .text(d => d.name)
                .attr('href', d => getUrl({project: d.name}))
                .attr(ATTR_TOOLTIP, d => locales.message("project-title",
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

    axios.get(metaUrl)
        .then(meta => {
            const projectData =  _.intersectionBy(meta.data, projectList,
                (project) => project.name ? project.name : project
            );
            const projects = buildProjectFilter(projectNavigation,
                projectData, currentProject, true
            );
            projectNavigation.start(projects);
            projectNavigation.setCurrentItem(currentProject);
        })
        .catch(function(error) {
            const projectData = _.zipWith(projectList, key => {
                return {name: key};
            });
            const projects = buildProjectFilter(projectNavigation,
                projectData, currentProject, false
            );
            projectNavigation.start(projects);
            projectNavigation.setCurrentItem(currentProject);
        });
};

/* Create organization navigation (only for combined predictions */
const makeOrganizationNavigation = function(organizations, currentOrganization) {
    if (_.size(organizations) <= 1) {
        return;
    }
    d3.select('#organizations-container').classed('is-hidden', false);
    const organizationNavigation = new Navigation({
        container: '#organizations-navigation',
        prefix: 'organization_',
        isActive: organization => organization === currentOrganization,
        setCurrentItem: (organization, hasOrganization) => {
            if (organization !== currentOrganization) {
                return false;
            }
            return true;
        },
        addElement: (element) => {
            element.style("width", "0%")
                .style("opacity", "0")
                .text(d => locales.retrieve(config.organizations, d))
                .attr('href', d => getUrl({organization: d}))
                .classed("tooltip", true)
                .attr(ATTR_TOOLTIP, d => locales.message("organization-title",
                    [locales.retrieve(config.organizations, d)]
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
    organizationNavigation.start(organizations);
    organizationNavigation.setCurrentItem(currentOrganization);
};

/* Create content within the page (possibly nested) */
const makeContent = function(context) {
    const displayValue = function(key, value, element, context) {
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
    let shownKeys = new Set();
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

/* Adjust a mimetype-to-fontawesome icon to newer FontAwesome specification */
const updateFileIcon = function(icon) {
    return icon.replace(/-o$/, '').replace(/-text$/, '-alt');
};

/* Create cards for file resources */
const makeFiles = function(data) {
    const files = data.data.files.filter(file => file.type !== 'dir');
    const cards = d3.select('#files').selectAll('.card').data(files);
    const card = cards.enter().append('div')
        .classed('card', true);
    const cardContent = card.append('div')
        .classed('card-content', true);
    const media = cardContent.append('div')
        .classed('media', true);
    media.append('div')
        .classed('media-left', true)
        .html(d => `<i class="far ${updateFileIcon(mimetype2fa(d.mimetype, {prefix: 'fa-'}))}"></i>`);
    media.append('div')
        .classed('media-content', true)
        .html(d => `<a href="${config.papers_url}/${d.name}">${d.name}</a>`);
};

const updateDropdown = function(dropdown, menu, target=null) {
    if (target !== null) {
        target.classed('is-hidden', false)
            .append(() => dropdown.remove().node());
    }
    menu.attr('role', 'menu');
    dropdown.classed('is-hidden', false);
    dropdown.select('.dropdown-trigger button')
        .attr('aria-controls', 'branches-menu');
    dropdown.select('.dropdown-trigger').on('click', () => {
        const active = !dropdown.classed('is-active');
        dropdown.classed('is-active', active);
        dropdown.select('.dropdown-trigger button')
            .classed('is-outlined', !active);
        dropdown.select('.dropdown-trigger .icon i')
            .classed('fa-angle-up', active)
            .classed('fa-angle-down', !active);
    });
};

/* Use configuration from a prediction branch to describe the menu item */
const addBranchConfiguration = function(descriptions, data, d, branch) {
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

/* Create a menu of prediction branches with different experiments/models */
const makeBranches = function(descriptions, target=null) {
    if (!config.branches_url) {
        return;
    }
    axios.get(config.branches_url)
        .then(response => {
            const container = d3.select('#branches');
            const branches = container.selectAll('.dropdown-item')
                .data(_.map(_.filter(response.data.jobs,
                    d => d.name.match(config.branches_filter || "")),
                    d => {
                        if (config.branches_alter) {
                            d.name = d.name.replace(
                                new RegExp(config.branches_alter), ""
                            );
                        }
                        return d;
                    }
                ));
            const items = branches.enter().append('a')
                .classed('dropdown-item', true)
                .classed('is-active', d => d.name === branch)
                .attr('role', 'menuitem')
                .attr('href', d => getUrl({project, branch: d.name}));
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
                        if (d.name === branch) {
                            makeOrganizationNavigation(configuration.data.organizations, decodeURIComponent(organization));
                        }
                    })
                    .catch(error => {
                        d3.select(this)
                            .attr('aria-hidden', d => d.name !== branch)
                            .classed('is-hidden', d => d.name !== branch);
                    });
            });
            // Don't show the dropdown if there are not branches known.
            // We could filter on :not(.is-hidden) here, but that only
            // applies after configuration requests are done, and there
            // should always be the current branch if there are branches.
            if (items.empty()) {
                return;
            }

            updateDropdown(d3.select('#branches-dropdown'),
                d3.select('#branches-menu'), target
            );
        })
        .catch((error) => {
            throw error;
        });
};

/* Create a sprint navigation for projects with multiple predicted sprints */
const makeSprints = function(data, project, sprints, container) {
    container.classed('is-hidden', sprints.length <= 1)
        .selectAll('li')
        .data(sprints)
        .enter()
        .append('li')
        .classed('is-active', d => _.isObject(d) ?
            d.sprint_num === data.sprint : d === data.sprint
        )
        .append('a')
        .attr('href', d => getUrl({project, sprint: d.sprint_id || d}))
        .text(d => _.isObject(d) && d.sprint_num !== data.sprint ?
            locales.message('sprint-link-name', [d.sprint_num, d.name]) :
            locales.message('sprint-link', [d.sprint_num || d]));
};

/* Handle a click on a toggle icon for expanding/collapsing a large container */
const clickToggle = function(container, hidden, d, toggle) {
    container.classed('is-hidden', false)
        .style('opacity', hidden ? 0 : 1)
        .transition()
        .style('opacity', hidden ? 1 : 0)
        .on("end", function() {
            d3.select(this).classed('is-hidden', !hidden);
        });
    toggle.attr('aria-expanded', hidden ? "true" : "false")
        .attr(ATTR_LABEL, locales.message(`${d.toggle}-${hidden ? "hide" : "show"}`))
        .attr(ATTR_TOOLTIP, locales.message(`${d.toggle}-${hidden ? "hide" : "show"}`))
        .select('i')
        .classed("fa-chevron-down", hidden)
        .classed("fa-chevron-right", !hidden);
};

/* Add export buttons */
const makeExport = function(context=null, requestUrl='', target=null) {
    const options = [
        {
            'name': 'dataset',
            'icon': ['fas', 'fa-file-alt'],
            'url': () => datasetUrl
        }
    ];
    if (!_.isEmpty(context)) {
        options.push({
            'name': 'json',
            'icon': ['fas', 'fa-shapes'],
            'url': () => URL.createObjectURL(new Blob(
                [window.JSON.stringify(context, null, 4)],
                {type: 'application/json'}
            ))
        });
    }
    if (requestUrl !== '') {
        options.push({
            'name': 'api',
            'icon': ['fas', 'fa-server'],
            'url': () => requestUrl
        });
    }
    if (config.openapi_url) {
        options.push({
            'name': 'openapi',
            'icon': ['fas', 'fa-cogs'],
            'url': () => config.openapi_url
        });
    }
    if (config.dataset_archive_url) {
        options.push({
            'name': 'archive',
            'icon': ['fas', 'fa-box-archive'],
            'url': () => config.dataset_archive_url
        });
    }
    const container = d3.select('#export-options');
    const item = container.selectAll('.dropdown-item')
        .data(options)
        .enter()
        .append('a')
        .classed('dropdown-item', true)
        .attr('role', 'menuitem')
        .attr('id', d => `export-${d.name}`);
    item.append('i')
        .attr('class', d => d.icon.join(' '))
        .classed('icon is-small', true);
    item.append('span')
        .text(d => locales.attribute('export', d.name));
    item.on('click', function(event, d) {
        const link = d3.select(document.body)
            .append('a')
            .classed('is-hidden', true)
            .attr('target', '_blank')
            .attr('href', d.url());
        link.node().click();
        link.remove();
    });
    updateDropdown(d3.select('#export-dropdown'), d3.select('#export-menu'),
        target
    );
};

/* Add toggles to collapse/expand large containers */
const makeToggles = function() {
    d3.selectAll('main .container .toggle')
        .classed('tooltip', true)
        .datum(function() {
            return this.dataset;
        })
        .each((d, i, nodes) => {
            const hidden = d3.select(`#${d.toggle}`).classed('is-hidden');
            const label = locales.message(`${d.toggle}-${hidden ? "show" : "hide"}`);
            d3.select(nodes[i])
                .attr(ATTR_LABEL, label)
                .attr(ATTR_TOOLTIP, label)
                .append('i')
                .classed(`fas fa-chevron-${hidden ? "right" : "down"}`, true);
        })
        .on('click', function(event, d) {
            const container = d3.select(`#${d.toggle}`);
            const hidden = container.classed('is-hidden');
            const toggle = d3.select(this);

            clickToggle(container, hidden, d, toggle);
        });
};

/* Build the entire page */
const makePage = function(projectList, organization, project, sprints, dataContext) {
    const fallback = {
        organization: decodeURIComponent(organization),
        project: decodeURIComponent(project),
        name: dataContext.data.id === null ? "" :
            locales.message("sprint-view"),
        features: (values) => _.pick(values,
            dataContext.data.configuration.features
        )
    };
    const context = _.assign({}, fallback, dataContext, {fallback,
        localization: _.assign({}, {
            features: {},
            sources: {},
            tags: {},
            units: {},
            short_units: {},
            metadata: {},
            organizations: config.organizations
        }, dataContext.localization)
    });

    makeProjectNavigation(projectList, context.project);
    makeOrganizationNavigation(context.data.configuration.organizations,
        context.organization
    );
    makeBranches(context.localization.descriptions || {},
        d3.select("#branches-target")
    );
    makeSprints(context.data, project, sprints || [], d3.select('#sprints'));
    makeContent(context);
    makeExport(context, dataUrl, d3.select("#export-target"));
    makeToggles();

    d3.select('#overview').classed('is-hidden', false);
    loadingSpinner.stop();
};

// Retrieve the appropriate data, either a navigation index or a project sprint
// prediction page
if (dataUrl === '') {
    const promises = [];

    // Build the navigation
    promises.push(axios.get(listUrl)
        .then(list => {
            makeProjectNavigation(list.data);
            makeExport({project: list.data}, listUrl);
        })
        .catch(function(error) {
            loadingSpinner.stop();
            // Do not show error for combined data set index because there is no
            // list of projects when no organization is selected yet.
            if (combined && !organization) {
                makeExport({}, apiUrl(branch, 'configuration'));
            }
            else {
                d3.select('#prediction-error-message')
                    .classed('is-hidden', false)
                    .text(locales.message("error-projects", [error]));
            }
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
    axios.get(listUrl).then(function(projectList) {
        const projects = projectList.data;
        axios.get(dataUrl).then(function(predictionData) {
            const data = predictionData.data;

            axios.all([
                axios.get(localeUrl('descriptions')),
                axios.get(localeUrl('sources')),
                axios.get(localeUrl('tags')),
                axios.get(localeUrl('units')),
                axios.get(localeUrl('short_units')),
                axios.get(localeUrl('metadata'))
            ])
            .then(axios.spread(function (descriptions, sources, tags, units, shortUnits, metadata) {
                const localization = {
                    features: descriptions.data,
                    sources: sources.data,
                    tags: tags.data,
                    units: units.data,
                    short_units: shortUnits.data,
                    metadata: metadata.data,
                    organizations: config.organizations
                };
                axios.all([
                    axios.get(linksUrl),
                    axios.get(sourcesUrl),
                    axios.get(sprintsUrl)
                ]).then(axios.spread(function (links, sourceLinks, sprints) {
                    makePage(projects, organization, project, sprints.data, {
                        data, localization,
                        links: links.data,
                        sources: sourceLinks.data
                    });
                }))
                .catch(function(error) {
                    makePage(projects, organization, project, [], {
                        data, localization,
                        links: {},
                        sources: {}
                    });
                });
            }))
            .catch(function(error) {
                makePage(projects, organization, project, [], {
                    data,
                    links: {},
                    sources: {}
                });
            });
        })
        .catch(function(error) {
            makeProjectNavigation(projects);
            loadingSpinner.stop();
            d3.select('#prediction-error-message')
                .classed('is-hidden', false)
                .text(locales.message("error-prediction", [error]));
        });
    })
    .catch(function(error) {
        loadingSpinner.stop();
        d3.select('#prediction-error-message')
            .classed('is-hidden', false)
            .text(locales.message("error-projects", [error]));
        throw error;
    });
}

locales.updateMessages();
locales.updateMessages(d3.select('main'), [ATTR_TOOLTIP]);

if (typeof window.buildNavigation === "function") {
    window.buildNavigation(Navbar, locales, _.assign({}, config, {
        visualization: 'prediction',
        language_page: getUrl({branch, project, sprint: project ? sprint : ''}),
        language_query: 'lang'
    }));
}
