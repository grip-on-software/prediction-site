pipeline {
    agent { label 'docker' }

    environment {
        SCANNER_HOME = tool name: 'SonarQube Scanner 3', type: 'hudson.plugins.sonar.SonarRunnerInstallation'
    }

    parameters {
        string(name: 'VISUALIZATION_ORGANIZATION', defaultValue: "${env.VISUALIZATION_ORGANIZATION}", description: 'Organization to build for')
        booleanParam(name: 'VISUALIZATION_COMBINED', defaultValue: true, description: 'Build for combined visualization')
    }
    options {
        gitLabConnection('gitlab')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    triggers {
        gitlab(triggerOnPush: true, triggerOnMergeRequest: true, branchFilterType: 'All')
    }

    post {
        success {
            publishHTML([allowMissing: false, alwaysLinkToLastBuild: false, keepAll: false, reportDir: 'public', reportFiles: 'index.html', reportName: 'Visualization', reportTitles: ''])
        }
        failure {
            updateGitlabCommitStatus name: env.JOB_NAME, state: 'failed'
        }
        aborted {
            updateGitlabCommitStatus name: env.JOB_NAME, state: 'canceled'
        }
    }

    stages {
        stage('Start') {
            when {
                not {
                    triggeredBy 'TimerTrigger'
                }
            }
            steps {
                updateGitlabCommitStatus name: env.JOB_NAME, state: 'running'
            }
        }
        stage('Build') {
            steps {
                sh 'docker build -t $DOCKER_REGISTRY/gros-prediction-site .  --build-arg NPM_REGISTRY=$NPM_REGISTRY'
            }
        }
        stage('Push') {
            when { branch 'master' }
            steps {
                sh 'docker push $DOCKER_REGISTRY/gros-prediction-site:latest'
            }
        }
        stage('Visualize') {
            agent {
                docker {
                    image "${env.DOCKER_REGISTRY}/gros-prediction-site"
                    reuseNode true
                }
            }
            steps {
                withCredentials([file(credentialsId: 'prediction-site-config', variable: 'PREDICTION_CONFIGURATION')]) {
                    sh 'rm -rf node_modules/'
                    sh 'ln -s /usr/src/app/node_modules .'
                    sh 'MIX_FILE=$WORKSPACE/webpack.mix.js npm run production'
                }
            }
        }
        stage('Status') {
            when {
                not {
                    triggeredBy 'TimerTrigger'
                }
            }
            steps {
                updateGitlabCommitStatus name: env.JOB_NAME, state: 'success'
            }
        }
    }
}
