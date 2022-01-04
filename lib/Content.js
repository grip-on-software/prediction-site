import _ from 'lodash';
import * as d3 from 'd3';
import frac from 'frac';
import moment from 'moment';
import vulgars from 'vulgarities';
import {vsprintf} from 'sprintf-js';
import Mustache from 'mustache';

const ATTR_LOCALIZATION = 'data-localization';
const ATTR_LOCALIZATION_KEY = 'data-localization-key';
const ATTR_LOCALIZATION_VALUE = 'data-localization-value';
const ATTR_TOOLTIP = 'data-tooltip';
const ATTR_LABEL = 'aria-label';
// Mapping for subkeys to feature localization (context.localization fields)
const SUB_LOCALIZATION_KEYS = {
    labels: 'features',
    metadata: null
};
const isExpression = (value) => typeof value === "object" && _.has(value, "expression");

class Content {
    constructor(key, value, element, context) {
        this.key = key;
        this.value = value;
        this.element = element;
        this.context = context;
        this.value_format = {
            fraction: (key, value, template) => {
                const D = this.context.localization.metadata.values[key].denominator;
                const [quot, num, den] = frac(Number(value), D, true);
                var text = null;
                if (num === 0) {
                    text = `${quot}`;
                }
                else {
                    const fraction = `${num}/${den}`;
                    text = `${quot === 0 ? '' : quot} ${vulgars[fraction] ? vulgars[fraction] : fraction}`;
                }
                return vsprintf(template, [text]);
            },
            time: (key, value) => {
                const time = moment(this.context.localization.metadata.values[key].epoch)
                    .add(value, this.context.localization.metadata.values[key].unit);
                return time.format('ll');
            }
        };
    }

    getText(valueElement, localizationKey, key, value, format='%s') {
        if (!valueElement.empty()) {
            return valueElement.text();
        }
        if (localizationKey) {
            const template = this.context.locales.retrieve(this.context.localization[localizationKey], key, '%s');
            if (this.context.localization.metadata.values &&
                this.context.localization.metadata.values[key] &&
                this.value_format[this.context.localization.metadata.values[key].type]
            ) {
                const type = this.context.localization.metadata.values[key].type;
                return this.value_format[type](key, value, template);
            }
            value = this.context.formatLocale.format("~r")(value);
            return vsprintf(template, [value]);
        }
        return value;
    }

    display() {
        let valueElement = d3.select(null);
        let valueClass = "";
        try {
            valueElement = this.element.select(
                `${this.context.selector}${this.key}-${this.value}`
            );
        }
        catch (e) {}

        let key = this.element.attr(ATTR_LOCALIZATION_KEY);
        if (!key) {
            key = this.key;
        }

        const configuration = this.context.data.configuration;
        if (configuration && configuration[key]) {
            key = configuration[key];
            if (isExpression(key)) {
                key = key.attributes[0];
            }
        }

        let localizationKey = this.context.localizationKey;
        if (!localizationKey) {
            localizationKey = this.element.attr(ATTR_LOCALIZATION_VALUE);
        }

        const configKey = this.element.attr('data-configuration');
        if (configKey && configuration && !configuration[configKey]) {
            valueElement = d3.select(null);
        }
        else if (!valueElement.empty()) {
            valueClass = valueElement.attr('class');
        }
        if (valueClass === "" &&
            this.context.localization.metadata.measurement &&
            this.context.localization.metadata.measurement[key] &&
            this.context.localization.metadata.measurement[key].pre) {
            const ref = this.context.data.features[this.context.localization.metadata.measurement[key].pre];
            if (this.value < ref) {
                valueClass = 'is-warning';
            }
            else if (this.value > ref) {
                valueClass = 'is-success';
            }
        }

        if (valueClass !== "") {
            this.context.container
                .select(`${this.context.selector}message-${this.key}`)
                .classed(valueClass, true);
        }

        this.element.text(this.getText(valueElement, localizationKey, key,
            this.value
        ));

        return true;
    }

    /* Extract an assignment with localized feature names */
    getAssignment(assignment) {
        if (!isExpression(assignment)) {
            return null;
        }

        if (assignment.attributes) {
            const features = this.context.localization.features;
            return _.replace(assignment.expression,
                new RegExp(`(?<=^|\\W)(${_.join(assignment.attributes, '|')})(?=\\W|$)`, "g"),
                (m, attribute) => `${this.context.locales.retrieve(features, attribute)}`
            );
        }
        return assignment.expression;
    }
}

class ArrayContent extends Content {
    display() {
        if (_.isEmpty(this.value)) {
            return false;
        }
        var template = this.element.select(`${this.context.selector}${this.key}-template`);
        _.forEach(_.filter(this.value, item => item !== null), (item) => {
            var subelement = template.clone(true).attr('id', null);
            const itemFallback = _.assign({}, this.context.fallback, {
                project: item.project_id
            });
            const context = _.assign({}, this.context, {
                data: item,
                fallback: itemFallback,
                container: subelement,
                selector: '.item-'
            });
            if (typeof item === "object") {
                this.context.build(context);
            }
            else {
                this.context.display(this.key, item, subelement, context);
            }
        });
        template.remove();
        return true;
    }
}

class ObjectContent extends Content {
    display() {
        if (_.size(this.value) === 0) {
            // No values to display
            return false;
        }

        var localizationKey = this.element.attr(ATTR_LOCALIZATION);
        const valueElement = d3.select(null);
        this.element.text(_.join(_.values(_.mapValues(this.value,
            (subvalue, subkey) => this.getText(valueElement, localizationKey,
                subkey, subvalue, `${subkey}: %s`
            )
        )), ', '));
        return true;
    }
}

class TableContent extends ObjectContent {
    display() {
        if (_.size(_.filter(this.value, v => v !== null)) === 0) {
            // No values to display
            return false;
        }

        const localizationKey = this.element.attr(ATTR_LOCALIZATION);
        const localizationValue = this.element.attr(ATTR_LOCALIZATION_VALUE);
        _.forIn(this.value, (subvalue, subkey) => {
            this.buildRow(subkey, subvalue, localizationKey, localizationValue);
        });
        return true;
    }

    buildRow(subkey, subvalue, localizationKey, localizationValue) {
        if (subvalue !== null && (typeof subvalue !== "object" || Array.isArray(subvalue) || isExpression(subvalue))) {
            const subLocalizationKey = _.get(SUB_LOCALIZATION_KEYS, subkey, subkey);
            const tr = this.element.select('tbody').insert('tr');
            const th = tr.append('td')
                .datum(subkey)
                .text(d => localizationKey !== null ?
                    this.context.locales.retrieve(this.context.localization[localizationKey], d) :
                    this.context.locales.attribute(this.key, d)
                );
            this.addIcons(th);
            const td = tr.append('td');
            if (Array.isArray(subvalue)) {
                const li = td.append('ul')
                    .selectAll("li")
                    .data(subvalue)
                    .enter()
                    .append('li')
                    .text(d => subLocalizationKey in this.context.localization ?
                        this.context.locales.retrieve(this.context.localization[subLocalizationKey], d) :
                        this.context.locales.attribute(subkey, d)
                    );

                this.addIcons(li);
            }
            else {
                const context = _.assign({}, this.context, {
                    data: subvalue,
                    container: td,
                    selector: '.table-',
                    localizationKey: subLocalizationKey in this.context.localization ?
                        subLocalizationKey : localizationValue
                });
                this.context.display(subkey, subvalue, td, context);
            }
        }
    }

    getIcon(source) {
        if (this.context.localization.sources &&
            this.context.localization.sources.icon &&
            this.context.localization.sources.icon[source]
        ) {
            return this.context.localization.sources.icon[source];
        }
        return null;
    }

    addIcons(item) {
        const icons = item.append('span').classed('table-icon', true);
        this.addSourceIcon(icons);
        this.addAssignmentIcon(icons);
    }

    addSourceIcon(icons) {
        const getSourceLink = d => {
            if (this.context.links[d]) {
                return {
                    "label": this.context.locales.message("source-link"),
                    "url": this.context.links[d].source
                };
            }
            if (this.context.sources[d]) {
                return {
                    "label": this.context.locales.message("source-link-source"),
                    "url": this.context.sources[d]
                };
            }
            return {"label": null, "url": null};
        };
        icons.append('a')
            .classed('tooltip', d => !!getSourceLink(d).label)
            .attr('href', d => getSourceLink(d).url)
            .attr('target', '_blank')
            .attr(ATTR_TOOLTIP, d => getSourceLink(d).label)
            .attr(ATTR_LABEL, d => getSourceLink(d).label)
            .classed('is-hidden', d => {
                if (this.getIcon(d) !== null) {
                    return false;
                }
                // only show the link if it is present
                if (!this.context.links[d]) {
                    return true;
                }
                return ["", " ", null].includes(this.context.links[d].source);
            })
            .append('span')
            .classed('icon is-small', true)
            .append('i')
            .attr('class', d => {
                const icon = this.getIcon(d);
                if (icon !== null) {
                    return icon.join(' ');
                }
                if (!this.context.links[d]) {
                    return null;
                }
                const sourceIcon = this.getIcon(this.context.links[d].type);
                if (sourceIcon !== null) {
                    return sourceIcon.join(' ');
                }
                return 'fa fa-info-circle';
            });
    }

    addAssignmentIcon(icons) {
        const assignments = this.context.data.configuration.assignments ?
            this.context.data.configuration.assignments : {};
        icons.append('span')
            .classed('tooltip is-tooltip-multiline', d => !!assignments[d])
            .attr(ATTR_TOOLTIP, d => this.getAssignment(assignments[d]))
            .attr(ATTR_LABEL, d => this.getAssignment(assignments[d]))
            .classed('is-hidden', d => {
                // only show the expression if it is present and is based on
                // attributes that we can translate
                if (!assignments[d] || !assignments[d].attributes ||
                    _.isEqual(assignments[d].attributes, ["NA"])
                ) {
                    return true;
                }
                return ["", " ", null].includes(assignments[d].expression);
            })
            .classed('icon is-small', true)
            .append('i')
            .classed('fa fa-info-circle', true);
    }
}

class ExpressionContent extends Content {
    display() {
        const assignment = this.getAssignment(this.value);
        this.element.text(assignment);
        return assignment !== null;
    }
}

class LinkContent extends Content {
    display() {
        let linkTemplate = this.element.attr('data-link-template');
        let linkValue = this.element.attr('data-link-value');
        if (this.context.data[linkValue] !== null &&
            this.context.data[linkValue] !== undefined
        ) {
            linkTemplate = linkTemplate.replace(/\$organization/g,
                this.context.organization
            );
            const url = Mustache.render(linkTemplate,
                _.assign({}, this.context.config, this.context.data), {},
                ['{$', '}']
            );
            if (url) {
                this.element.attr('href', url);
                const className = this.element.attr('data-link-class');
                if (className !== null) {
                    this.element.classed(className, true);
                }
            }
        }
        this.element.text(this.value);
        return true;
    }
}

class PercentContent extends Content {
    display() {
        this.element.text(this.context.formatLocale.format("~p")(this.value));
        return true;
    }
}

class ProgressContent extends Content {
    display() {
        const progressValue = this.value * 100;
        let progressClass = 'is-success';

        if (progressValue >= 20 && progressValue < 80) {
            progressClass = 'is-warning';
        }
        else if (progressValue >= 80) {
            progressClass = 'is-danger';
        }
        this.element.attr('value', progressValue)
            .text(progressValue + '%')
            .classed('tooltip', true)
            .attr(ATTR_TOOLTIP, progressValue + '%')
            .classed(progressClass, true);
        return true;
    }
}

class LocaleContent extends Content {
    display() {
        var localizationKey = this.element.attr(ATTR_LOCALIZATION);
        this.element.text(this.context.locales.retrieve(this.context.localization[localizationKey], this.value));
        return true;
    }
}

class LocaleAttributeContent extends Content {
    display() {
        this.element.text(this.context.locales.attribute(this.key, this.value));
        return true;
    }
}

class DateContent extends Content {
    display() {
        var date = this.context.moment(this.value, "YYYY-MM-DD HH:mm:ss", true);
        this.element.text(date.format('ll')).attr('title', date.format());
        return true;
    }
}

class BooleanContent extends Content {
    display() {
        this.element.text(this.context.locales.message(this.value ? "boolean-yes" : "boolean-no"));
        return true;
    }
}

const predicateTypes = [
    [(value) => Array.isArray(value), ArrayContent],
    [(value) => isExpression(value), ExpressionContent],
    [(value, element) => typeof value === "object" && element.node &&
        element.node().nodeName.toLowerCase() === "table", TableContent],
    [(value) => typeof value === "object", ObjectContent],
    [(value, element) => element.attr('data-link-template') !== null, LinkContent],
    [(value, element) => element.text() === '%', PercentContent],
    [(value, element) => element.classed('progress'), ProgressContent],
    [(value, element) => element.attr(ATTR_LOCALIZATION) !== null, LocaleContent],
    [(value, element, key, context) => context.locales.get(key) !== undefined, LocaleAttributeContent],
    [(value) => moment(value, "YYYY-MM-DD HH:mm:ss", true).isValid(), DateContent],
    [(value) => [true, false].includes(value), BooleanContent]
];

export default Content;
export { Content, predicateTypes };
