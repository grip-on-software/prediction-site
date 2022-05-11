/**
 * Content elements for the prediction view.
 *
 * Copyright 2017-2020 ICTU
 * Copyright 2017-2022 Leiden University
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

/* Generic content element */
class Content {
    constructor(key, value, element, context) {
        this.key = key;
        this.value = value;
        this.element = element;
        this.context = context;

        // Formatting functions for specific types of data, as defined using
        // the localization key within the localization metadata.
        this.value_format = {
            fraction: (key, value, template) => {
                const D = this.context.localization.metadata.values[key].denominator;
                const [quot, num, den] = frac(Number(value), D, true);
                let text = null;
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

    /* Retrieve text that most accurately describes the value for the content */
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
        // Determine localization key (data-localization-key attribute),
        // possibly a key from the model configuration. The localization key is
        // used as the 'label' of this content and only makes sense in context
        // of the localization value-key.
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

        // Determine localization value-key (data-localization-value attribute),
        // which could be defined by the context (e.g. nested table content).
        // The localization value-key determines which localization object is
        // used to use the localization key in to retrieve the localized 'label'
        // of this content. Valid localization value-keys are currently:
        // "features", "tags", "units", and "short_units".
        let localizationKey = this.context.localizationKey;
        if (!localizationKey) {
            localizationKey = this.element.attr(ATTR_LOCALIZATION_VALUE);
        }

        const {valueElement, valueClass, valueCompare} =
            this.determineValueClass(key);
        if (valueClass !== "") {
            const message = this.context.container
                .select(`${this.context.selector}message-${this.key}`)
                .classed(valueClass, true);
            if (valueCompare !== null) {
                const compare = message.select('.compare');
                compare.attr(
                    compare.attr('data-compare'),
                    this.context.locales.message("value-compare",
                        this.getText(d3.select(null), localizationKey,
                            valueCompare,
                            this.context.data.features[valueCompare]
                        )
                    )
                );
            }
        }

        this.element.text(this.getText(valueElement, localizationKey, key,
            this.value
        ));

        return true;
    }

    /* Determine if the content can be given a value class from an element
     * which determines how specific values are displayed
     */
    determineValueClass(key) {
        let valueElement = d3.select(null);
        let valueClass = "";
        let valueCompare = "";
        try {
            valueElement = this.element.select(
                `${this.context.selector}${this.key}-${this.value}`
            );
        }
        catch (e) {}

        const configKey = this.element.attr('data-configuration');
        const configuration = this.context.data.configuration;
        if (configKey && configuration && !configuration[configKey]) {
            valueElement = d3.select(null);
        }
        else if (!valueElement.empty()) {
            valueClass = valueElement.attr('class');
        }
        if (valueClass === "" && this.context.data.features &&
            _.has(this.context.localization.metadata, ['measurement', key, 'pre'])) {
            valueCompare = this.context.localization.metadata.measurement[key].pre;
            const ref = this.context.data.features[valueCompare];
            if (this.value < ref) {
                valueClass = 'is-warning';
            }
            else if (this.value > ref) {
                valueClass = 'is-success';
            }
        }

        return {valueElement, valueClass, valueCompare};
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

/* Content based on an array, where each item of the array is formatted using
 * a template and the item itself is expanded in nested form.
 */
class ArrayContent extends Content {
    display() {
        if (_.isEmpty(this.value)) {
            return false;
        }
        const template = this.element.select(`${this.context.selector}${this.key}-template`);
        _.forEach(_.filter(this.value, item => item !== null), (item) => {
            const subelement = template.clone(true).attr('id', null);
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

/* Content based on an object, where keys and values are shown in a flat
 * comma-separated list. The data-localization attribute determines which
 * localization object is used for the format of each key-value pair, falling
 * back to a colon-separated pair.
 */
class ObjectContent extends Content {
    display() {
        if (_.size(this.value) === 0) {
            // No values to display
            return false;
        }

        const localizationKey = this.element.attr(ATTR_LOCALIZATION);
        const valueElement = d3.select(null);
        this.element.text(_.join(_.values(_.mapValues(this.value,
            (subvalue, subkey) => this.getText(valueElement, localizationKey,
                subkey, subvalue, `${subkey}: %s`
            )
        )), ', '));
        return true;
    }
}

/* Content based on an object, formatted using a table, where keys and values
 * are shown in rows with nested value content.
 */
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

    /* Build a row for one key-value pair */
    buildRow(subkey, subvalue, localizationKey, localizationValue) {
        if (subvalue === null || (typeof subvalue === "object" && !Array.isArray(subvalue) && !isExpression(subvalue))) {
            // Skip null subvalues and subvalues for which we have no proper
            // content format
            return;
        }

        const tr = this.element.select('tbody').insert('tr');
        this.buildKeyCell(tr, subkey, localizationKey);
        this.buildValueCell(tr, subkey, subvalue, localizationValue);
    }

    /* Build a cell for a key */
    buildKeyCell(tr, subkey, localizationKey) {
        const th = tr.append('td')
            .datum(subkey)
            .text(d => localizationKey !== null ?
                this.context.locales.retrieve(this.context.localization[localizationKey], d) :
                this.context.locales.attribute(this.key, d)
        );
        this.addIcons(th);
    }

    /* Build a cell for a value (with nested content) */
    buildValueCell(tr, subkey, subvalue, localizationValue) {
        const subLocalizationKey = _.get(SUB_LOCALIZATION_KEYS, subkey, subkey);
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

    /* Retrieve a FontAwesome icon description for a source type */
    getIcon(source) {
        return _.get(this.context.localization.sources, ['icon', source], null);
    }

    /* Retrieve items for a value cell */
    addIcons(item) {
        const icons = item.append('span').classed('table-icon', true);
        this.addSourceIcon(icons);
        this.addAssignmentIcon(icons);
    }

    /* Add an icon for the source of a value */
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
            .attr('role', d => getSourceLink(d).url ? 'link' : null)
            .attr(ATTR_TOOLTIP, d => getSourceLink(d).label)
            .attr(ATTR_LABEL, d => getSourceLink(d).label)
            .classed('is-hidden', d => {
                // Always show direct source links if we have one
                if (this.getIcon(d) !== null) {
                    return false;
                }
                // Only show the link of a feature if it has one
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
                    return `${icon.join(' ')} fa-sm`;
                }
                if (!this.context.links[d]) {
                    return null;
                }
                const sourceIcon = this.getIcon(this.context.links[d].type);
                if (sourceIcon !== null) {
                    return `${sourceIcon.join(' ')} fa-sm`;
                }
                return 'fa fa-info-circle fa-sm';
            });
    }

    /* Add a tooltip icon for the assignment of an expression value */
    addAssignmentIcon(icons) {
        const assignments = this.context.data.configuration.assignments ?
            this.context.data.configuration.assignments : {};
        icons.append('span')
            .classed('tooltip has-tooltip-multiline', d => !!assignments[d])
            .attr(ATTR_TOOLTIP, d => this.getAssignment(assignments[d]))
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
            .classed('fa fa-info-circle fa-sm', true);
    }
}

/* Content based on an expression, formatted in a human-readable form */
class ExpressionContent extends Content {
    display() {
        const assignment = this.getAssignment(this.value);
        this.element.text(assignment);
        return assignment !== null;
    }
}

/* Textual content which has a link template which uses other contextual data
 * such as identifiers to refer to the element elsewhere, and if so may provide
 * an additional class to the link
 */
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

/* Numeric content where the value (between 0-1) is formatted as a percentage */
class PercentContent extends Content {
    display() {
        this.element.text(this.context.formatLocale.format("~p")(this.value));
        return true;
    }
}

/* Numeric content where the value (between 0-1) is formatted as a
 * partially-filled progress bar
 */
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
            .text(`${progressValue}%`)
            .classed('tooltip', true)
            .attr(ATTR_TOOLTIP, `${progressValue}%`)
            .classed(progressClass, true);
        return true;
    }
}

/* Content which uses a localization object to format the value */
class LocaleContent extends Content {
    display() {
        const localizationKey = this.element.attr(ATTR_LOCALIZATION);
        this.element.text(this.context.locales.retrieve(this.context.localization[localizationKey], this.value));
        return true;
    }
}

/* Content which uses the key to select a locales object to format the value */
class LocaleAttributeContent extends Content {
    display() {
        this.element.text(this.context.locales.attribute(this.key, this.value));
        return true;
    }
}

/* Content which formats the value as a date */
class DateContent extends Content {
    display() {
        const date = this.context.moment(this.value, "YYYY-MM-DD HH:mm:ss", true);
        this.element.text(date.format('ll')).attr('title', date.format());
        return true;
    }
}

/* Content which formats the value as a 'yes' or 'no' message */
class BooleanContent extends Content {
    display() {
        this.element.text(this.context.locales.message(this.value ? "boolean-yes" : "boolean-no"));
        return true;
    }
}

// Ordered predicates which are tried one after another to determine which
// content object to use to format the provided value in the element that was
// selected to contain it. Based on the type of value or the templating data
// on the element, the predicate indicates if the content object is suitable.
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
