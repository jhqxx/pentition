pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'gitlab-root', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASS')]) {
                    sh 'bash /usr/local/bin/gitlab-checkout.sh'
                }
            }
        }

        stage('Build Windows (native, NSIS + portable)') {
            steps {
                sh 'bash /usr/local/bin/build-pentition-nsis.sh'
            }
        }

        stage('Archive') {
            steps {
                archiveArtifacts artifacts: 'source/release/*.exe', allowEmptyArchive: false
            }
        }

        stage('Upload to GitLab') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'gitlab-root', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASS')]) {
                    sh 'bash /usr/local/bin/gitlab-upload.sh'
                }
            }
        }
    }

    post {
        always {
            echo "Pipeline finished: ${currentBuild.currentResult}"
        }
    }
}
