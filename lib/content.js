import _ from 'lodash';
import moment from 'moment';
import {vsprintf} from 'sprintf-js';

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
        if (valueElement && !valueElement.empty()) {
            this.context.container
                .select(`${this.context.selector}message-${this.key}`)
                .classed(valueElement.attr('class'), true);
            this.element.text(valueElement.text());
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


        var localizationKey = this.element.attr('data-localization');
        _.forIn(this.value, (subvalue, subkey) => {
            if (subvalue !== null) {
                const tr = this.element.select('tbody').insert('tr');
                tr.append('td').text(localizationKey !== null ?
                    this.context.locales.retrieve(this.context.localization[localizationKey], subkey) : subkey
                );
                const td = tr.append('td');
                if (typeof subvalue === "object") {
                    td.append('ul')
                        .selectAll("li")
                        .data(subvalue)
                        .enter()
                        .append('li')
                        .text(d => subkey in this.context.localization ?
                            this.context.locales.retrieve(this.context.localization[subkey], d) : d);
                }
                else {
                    td.text(subvalue);
                }
            }
        });
        return true;
    }
}

class LinkContent extends Content {
    display() {
        var linkConfig = this.element.attr('data-link-config');
        var linkValue = this.element.attr('data-link-value');
        if (this.context.data[linkValue] !== null &&
            this.context.data[linkValue] !== undefined
        ) {
            this.element.attr('href',
                this.context.config[linkConfig] + this.context.data[linkValue]
            );
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
            .attr('title', progressValue + '%')
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

class DateContent extends Content {
    display() {
        var date = this.context.moment(this.value, "YYYY-MM-DD HH:mm:ss", true);
        this.element.text(date.format('ll')).attr('title', date.format());
        return true;
    }
}

const predicateTypes = [
    [(value) => Array.isArray(value), ArrayContent],
    [(value, element) => typeof value === "object" && element.node &&
        element.node().nodeName.toLowerCase() === "table", TableContent],
    [(value) => typeof value === "object", ObjectContent],
    [(value, element) => element.attr('data-link-config') !== null, LinkContent],
    [(value, element) => element.text() === '%', PercentContent],
    [(value, element) => element.classed('progress'), ProgressContent],
    [(value, element) => element.attr('data-localization') !== null, LocaleContent],
    [(value) => moment(value, "YYYY-MM-DD HH:mm:ss", true).isValid(), DateContent]
];

export { Content, predicateTypes };
