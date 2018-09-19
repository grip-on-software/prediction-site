import _ from 'lodash';
import moment from 'moment';
import {vsprintf} from 'sprintf-js';
import Mustache from 'mustache';

class Content {
    constructor(key, value, element, context) {
        this.key = key;
        this.value = value;
        this.element = element;
        this.context = context;
    }

    display() {
        var valueElement;
        try {
            valueElement = this.element.select(
                `${this.context.selector}${this.key}-${this.value}`
            );
        }
        catch (e) {
            valueElement = null;
        }

        let key = this.element.attr('data-localization-key');
        if (!key) {
            key = this.key;
        }

        const configuration = this.context.data.configuration;
        if (configuration && configuration[key]) {
            key = configuration[key];
        }

        let localizationKey = this.context.localizationKey;
        if (!localizationKey) {
            localizationKey = this.element.attr('data-localization-value');
        }

        const configKey = this.element.attr('data-configuration');
        if (configKey && configuration && !configuration[configKey]) {
            valueElement = null;
        }

        if (valueElement && !valueElement.empty()) {
            this.context.container
                .select(`${this.context.selector}message-${this.key}`)
                .classed(valueElement.attr('class'), true);
            this.element.text(valueElement.text());
        }
        else if (localizationKey) {
            const template = this.context.locales.retrieve(this.context.localization[localizationKey], key, '%s');
            const value = this.context.formatLocale.format("~s")(this.value);
            this.element.text(vsprintf(template, [value]));
        }
        else {
            this.element.text(this.value);
        }
        return true;
    }
}

class ArrayContent extends Content {
    display() {
        var template = this.element.select(`${this.context.selector}${this.key}-template`);
        _.forEach(this.value, (item) => {
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

        var localizationKey = this.element.attr('data-localization');
        this.element.text(_.join(_.values(_.mapValues(this.value,
            (subvalue, subkey) => localizationKey !== null ?
                vsprintf(this.context.locales.retrieve(this.context.localization[localizationKey],
                    subkey, `${subkey}: %s`), [subvalue]) :
                `${subkey}: ${subvalue}`
        )), ', '));
        return true;
    }
}

class TableContent extends ObjectContent {
    display() {
        if (_.size(this.value) === 0) {
            // No values to display
            return false;
        }

        const localizationKey = this.element.attr('data-localization');
        const localizationValue = this.element.attr('data-localization-value');
        _.forIn(this.value, (subvalue, subkey) => {
            this.buildRow(subkey, subvalue, localizationKey, localizationValue);
        });
        return true;
    }

    buildRow(subkey, subvalue, localizationKey, localizationValue) {
        if (subvalue !== null && (typeof subvalue !== "object" || Array.isArray(subvalue))) {
            const tr = this.element.select('tbody').insert('tr');
            const th = tr.append('td')
                .datum(subkey)
                .text(d => localizationKey !== null ?
                    this.context.locales.retrieve(this.context.localization[localizationKey], d) :
                    this.context.locales.attribute(this.key, d)
                );
            this.addIcons(th);
            const td = tr.append('td');
            if (typeof subvalue === "object") {
                const li = td.append('ul')
                    .selectAll("li")
                    .data(subvalue)
                    .enter()
                    .append('li')
                    .text(d => subkey in this.context.localization ?
                        this.context.locales.retrieve(this.context.localization[subkey], d) : d);

                this.addIcons(li);
            }
            else {
                const context = _.assign({}, this.context, {
                    data: subvalue,
                    container: td,
                    selector: '.table-',
                    localizationKey: localizationValue
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
        icons.append('a')
            .classed('tooltip', d => !!this.context.links[d])
            .attr('href', d => this.context.links[d] ? this.context.links[d].source : null)
            .attr('target', '_blank')
            .attr('data-tooltip', d => this.context.links[d] ? this.context.locales.message("source-link") : null)
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
            .attr('data-tooltip', d => assignments[d] ? assignments[d].expression : null)
            .classed('is-hidden', d => {
                // only show the link if it is present
                if (!assignments[d]) {
                    return true;
                }
                return ["", " ", null].includes(assignments[d].expression);
            })
            .classed('icon is-small', true)
            .append('i')
            .classed('fa fa-info-circle', true);
    }
}

class LinkContent extends Content {
    display() {
        var linkTemplate = this.element.attr('data-link-template');
        var linkValue = this.element.attr('data-link-value');
        if (this.context.data[linkValue] !== null &&
            this.context.data[linkValue] !== undefined
        ) {
            Mustache.parse(linkTemplate, ['{$', '}']);
            this.element.attr('href', Mustache.render(linkTemplate,
                Object.assign({}, this.context.config, this.context.data)
            ));
        }
        this.element.text(this.value);
        return true;
    }
}

class PercentContent extends Content {
    display() {
        this.element.text(`${this.value * 100}%`);
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
            .attr('data-tooltip', progressValue + '%')
            .classed(progressClass, true);
        return true;
    }
}

class LocaleContent extends Content {
    display() {
        var localizationKey = this.element.attr('data-localization');
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
    [(value, element) => typeof value === "object" && element.node &&
        element.node().nodeName.toLowerCase() === "table", TableContent],
    [(value) => typeof value === "object", ObjectContent],
    [(value, element) => element.attr('data-link-template') !== null, LinkContent],
    [(value, element) => element.text() === '%', PercentContent],
    [(value, element) => element.classed('progress'), ProgressContent],
    [(value, element) => element.attr('data-localization') !== null, LocaleContent],
    [(value, element, key, context) => context.locales.get(key) !== undefined, LocaleAttributeContent],
    [(value) => moment(value, "YYYY-MM-DD HH:mm:ss", true).isValid(), DateContent],
    [(value) => [true, false].includes(value), BooleanContent]
];

export { Content, predicateTypes };
