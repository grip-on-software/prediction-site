# Prediction site

This repository contains a visualization for a human-readable and visual output 
of the predictions generated based on the latest sprint features of the 
projects from a data set selected from a Grip on Software database.

## Configuration

Copy the file `lib/config.json` to `config.json` and adjust environmental 
settings in that file. The following configuration items are known:

- `visualization_url`: The URL to the visualization hub. This may include 
  a protocol and domain name, but does not need to in case the visualizations 
  and the prediction site are hosted on the same domain. The remainder is 
  a path to the root of the visualizations, where the dashboard is found and 
  every other visualization has sub-paths below it.
- `prediction_url`: The URL to the prediction site. This may include a protocol 
  and domain name, although this is not necessary as it is assumed that the 
  prediction site and prediction data are hosted under the same domain and 
  path. If it does have a domain, then the prediction data may be loaded from 
  an API there (but only outside of development). In a production site, this 
  will likely have to be an absolute URL (either with protocol or domain name 
  or with just an absolute path on this server).
- `path`: The relative path at which the prediction site is made available on 
  the server. This is probably the same as the `prediction_url`, but may be 
  relevant to set to something else, for example if the URL includes a protocol 
  and domain name. For a production site, the default value of the empty string
  is likely insufficient, as it will not allow relative paths to resources to
  succeed when a rewritten URL with subpaths is used. It should also not be set
  to `.` like in other visualizations as this is added as a prefix to some 
  resource requests, and it should therefore end in a slash if it is not empty.
  The path should however not just consist of a slash. Either an empty string
  or `./` should work within a development context, while in production this is 
  likely (a variant of) the `prediction_url`.
- `language`: The language code of the default language of the site.
- `organizations`: An object containing organization names that may exist 
  within the data set. The keys of this object are language codes, while the 
  values are nested objects, whose keys are organization identifiers and values 
  are strings that replace the identifiers within the organization navigation 
  (for combined data sets) and the configuration.
- `branches_url`: The URL pointing to a JSON endpoint that specifies the 
  currently available branches of prediction results. If available, the JSON in 
  the response must be an object with a `jobs` key in it, which has an array 
  value where the elements are objects with a `name` value that points to the 
  branch name. The JSON API of a multibranch pipeline job in Jenkins is 
  compatible with this expected response. The URL may be set to an empty string 
  to disable branch experiments.
- `branches_filter`: A regular expression that is used as a search pattern on 
  the names of branches from the `branches_url` endpoint. Only branch names 
  that match the pattern are made available. This may be useful to filter on 
  organizations or to hide temporary experiments.
- `branches_alter`: A regular expression that is used as a search pattern on 
  the names of branches from the `branches_url` endpoint. Branch names that 
  match the pattern have the matching part removed from the name. This may be 
  useful for stripping organization names from branch names.
- `branch_url`: The URL prefix to use when referring to a specific branch 
  within the visualization site. The prefix is an absolute path and should 
  contain the `path` due to this as well.
- `master_url`: The URL prefix to use when referring to the default branch 
  within the visualization site. The prefix is an absolute path and should 
  contain the `path` due to this as well.
- `files_url`: The URL pointing to a JSON endpoint that specifies the files 
  available as additional resources aside from the prediction data. If 
  available, the JSON in the response must be an object with the `files` key in 
  it, which has an array value where the elements are objects with `type`, 
  `mimetype` and `name` values in them. The `type` is a string, and anything 
  other than `dir` causes the item to be considered a file. The `mimetype` 
  should be a valid MIME type. The `name` should be a filename under which the 
  file is available. The JSON API of an ownCloud share is compatible with this 
  expected response. The URL may be set to an empty string to disable auxiliary 
  files.
- `papers_url`: The URL prefix to use when referring to a specific file that is 
  made available as an additional resource. The URL may be absolute to 
  protocol, domain or path. If it is absolute to the path, then it should 
  contain the `path` as well.
- `jira_url`: The URL pointing to a Jira instance in order to link to sprints. 
  If this is set to an empty string, then sprints are not linked.

Unless otherwise specified, all configuration items are strings, but may be 
objects as well. If they are objects, they may contain keys that are 
`combined`, `default`, or refer to specific organizations for which the 
prediction site (and its predictions) is being generated. This allows the 
configuration file to be used for several builds. Depending on the values of 
the environment variables `$VISUALIZATION_ORGANIZATION` and 
`$VISUALIZATION_COMBINED`, the actual configuration selects the organization's 
entry in the object, the `combined` key's value, or the value for the `default` 
key. This is mostly helpful for configuration items that may differ per 
organization, like `branches_filter` and `branches_alter`.

For URLs, another method exists to make them agnostic to organizations. The 
value is searched for the substring `$organization`, possibly after slashes. 
These can be replaced with the actual organization that the build is for. For 
combined builds, it is prefixed or replaced with `/combined`, depending on 
which URL configuration it is.

## Running, data and deployment

The visualization can be built using Node.js and `npm` by running `npm install` 
and then either `npm run watch` to start a development server that also 
refreshes browsers upon code changes, or `npm run production` to create 
a minimized bundle. The resulting HTML, CSS and JavaScript is made available in 
the `public` directory.

This repository also contains a `Dockerfile` specification for a Docker image 
that can perform the installation of the app and dependencies, which allows 
building the visualization within there.

Within a development or another locally hosted server (where browsers connect 
to with `localhost` as domain name), prediction data must be placed in the 
`public/data` directory. The data for the predictions can be collected, 
analyzed and predicted through runs of the `data-analysis` and `prediction` 
repositories, specifically the `features.r` analysis script, the `tensor.py` 
prediction script, and the `sprint_results.r` analysis script, after another. 

In a production environment, the configuration must be set in such a way that 
it provides access to an API-like setup with several endpoints for the 
prediction data (including projects, sprints, model configuration, locales, and 
metadata), but also for branches of multiple prediction runs and files that are 
made available for background on the predictions. The integrated method of 
making this possible is through the `visualization-site` repository, which 
provides the API rewrites.

The `prediction` repository contains a `Jenkinsfile` with appropriate steps for 
a Jenkins CI deployment to perform the predictions and archive the results, 
whereas the `Jenkinsfile` in this repository simply builds the visualization. 
Unlike with other visualizations, the code is also not analyzed using SonarQube 
in this `Jenkinsfile`, but only in `visualization-site`. This is to avoid 
double work for the prediction site, which is considered separate from the 
visualization hub but the tests remain centralized.
