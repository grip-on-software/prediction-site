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

// Use a public-hosted file for local debugging: Single project
let dataUrl = 'data/latest.json';
let listUrl = 'data/projects.json';
let metaUrl = 'data/projects_meta.json';
let localeUrl = item => `data/${item}.json`;
let linksUrl = 'data/links.json';
let sourcesUrl = 'data/project_sources.json';
let sprintsUrl = 'data/sprints.json';
config.navLink = '?project=';
config.sprintLink = '&sprint=';

const searchParams = new URLSearchParams(window.location.search);
let project = searchParams.get("project");
let sprint = searchParams.get("sprint");
let branch = searchParams.get("branch") || 'master';
let organization = searchParams.get("organization");
let apiUrl = (branch, item) => `data/${item}.json`;
let predictionUrl = config.prediction_url;

const selectedLocale = locales.select(searchParams.get("lang"));
moment.locale(locales.lang);

// If we are on localhost, use the local file.
// The project prediction data can be overridden using the query string,
// or disabled (index view) using 'index' as query string.
// If we're not on localhost, load the data from the prediction API.
if (location.hostname === "localhost") {
    /* istanbul ignore next */
    if (project === 'index' || project === '' || project === null) {
        dataUrl = '';
        linksUrl = '';
        sprintsUrl = '';
    }
    else {
        dataUrl = `data/${project}/${sprint === null ? "latest" : sprint}.json`;
        const suffix = (sprint === null ? "" : `.${sprint}`);
        linksUrl = `data/${project}/links${suffix}.json`;
        sourcesUrl = `data/${project}/sources.json`;
        sprintsUrl = `data/${project}/sprints.json`;
    }
}
else {
    var base;
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
                baseParts[index] === "$organization" &&
                baseParts[index - 1] === "combined"))
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
    if (project === null) {
        project = finalPart === 'index.html' ? '' : finalPart;
    }
    if (sprint === null) {
        sprint = "latest";
    }
    if (organization === null) {
        const organizationIndex = baseParts.indexOf("$organization", 1);
        organization = organizationIndex !== -1 ? parts[organizationIndex] : "";
        if (parts[organizationIndex] === "prediction") {
            organization = "";
        }
    }

    config.navLink = predictionUrl;
    config.navLink += trailer.filter(part => part !== '').join('/');
    if (config.navLink.substr(-1) !== '/') {
        config.navLink += '/';
    }
    config.sprintLink = '/sprint/';

    predictionUrl = predictionUrl.replace(/\/\$organization/g,
        organization ? "/" + organization : ""
    );
    apiUrl = (branch, item) => {
        const version = (branch === 'master' ? '' : `-${branch}`);
        return `${preidctionUrl}api/v1${version}/${item}`;
    };

    dataUrl = project ?
        apiUrl(branch, `predict/jira/${project}/sprint/${sprint}`) : '';
    listUrl = apiUrl(branch, 'list/jira');
    metaUrl = apiUrl(branch, 'list/meta');
    sourcesUrl = project ? apiUrl(branch, `links/${project}`) : '';
    localeUrl = item => apiUrl(branch, `locale/${item}`);
    linksUrl = project ? apiUrl(branch, `links/${project}/sprint/${sprint}`) : '';
    sprintsUrl = project ? apiUrl(branch, `predict/jira/${project}/sprints`) : '';
}

const getUrl = function(params) {
    const specialLinks = {
        "master": `${config.master_url}/`
    };
    const base = params.branch ? _.get(specialLinks, params.branch,
        `${config.branch_url}/${params.branch}/`
    ) : config.navLink;
    const org = params.organization || organization;
    const url = new URL(
        base.replace(/\/\$organization/g, org ? "/" + org : "") +
            (params.project || "") +
            (params.sprint ? config.sprintLink + params.sprint : ""),
        document.location
    );

    if (locales.lang !== config.language) {
        url.searchParams.set("lang", locales.lang);
    }
    return url;
};

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

const makeProjectNavigation = function(projectList, currentProject) {
    // Create project navigation
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
            element.classed('tooltip is-tooltip-multiline is-tooltip-center', true)
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

const makeOrganizationNavigation = function(organizations, currentOrganization) {
    if (_.size(organizations) <= 1) {
        return;
    }
    d3.select('#organizations-container').classed('is-hidden', false);
    const organizationNavigation = new Navigation({
        container: '#organizations',
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
                .text(d => d)
                .attr('href', d => getUrl({organization: d}))
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

const updateFileIcon = function(icon) {
    return icon.replace(/-o$/, '').replace(/-text$/, '-alt');
};

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
        .html(d => `<a href="${predictionUrl}papers/${d.name}">${d.name}</a>`);
};

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

const makeBranches = function(descriptions, target=null) {
    if (config.branches_url) {
        axios.get(config.branches_url)
            .then(response => {
                const branches = d3.select('#branches').selectAll('dropdown-item')
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
                                .classed('is-hidden', d => d.name !== branch);
                        });
                });
                const dropdown = d3.select('#branches-dropdown');
                if (target !== null) {
                    target.append(() => dropdown.remove().node());
                }
                dropdown.classed('is-hidden', false);
                dropdown.select('.dropdown-trigger').on('click', () => {
                    const active = !dropdown.classed('is-active');
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
        .on('click', (d, i, nodes) => {
            const container = d3.select(`#${d.toggle}`);
            const hidden = container.classed('is-hidden');
            const toggle = d3.select(nodes[i]);

            clickToggle(container, hidden, d, toggle);
        });
};

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
            metadata: {}
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
    makeToggles();

    d3.select('#overview').classed('is-hidden', false);
    loadingSpinner.stop();
};

if (dataUrl === '') {
    const promises = [];

    // Build the navigation
    promises.push(axios.get(listUrl)
        .then(list => {
            makeProjectNavigation(list.data);
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
                    metadata: metadata.data
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
    searchParams.delete("lang");
    window.buildNavigation(Navbar, locales, _.assign({}, config, {
        language_query: searchParams.toString() === '' ? 'lang' :
            `${searchParams}&lang`
    }));
}
