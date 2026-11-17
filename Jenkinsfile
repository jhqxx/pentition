pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 90, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    triggers {
        pollSCM('H/3 * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'gitlab-root', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASS')]) {
                    sh 'bash /usr/local/bin/gitlab-checkout.sh'
                }
            }
        }

        stage('Verify version') {
            steps {
                script {
                    def version = sh(script: "sed -n 's/^ *\"version\": *\"\\([^\"]*\\)\".*/\\1/p' source/package.json | head -1", returnStdout: true).trim()
                    if (!version) {
                        error 'source/package.json 里读不到 version'
                    }
                    def tag = sh(script: "git -C source fetch --tags --quiet 2>/dev/null || true; git -C source describe --tags --exact-match 2>/dev/null || true", returnStdout: true).trim()
                    env.APP_VERSION = version
                    env.APP_TAG = tag
                    if (tag && tag != "v${version}") {
                        error "tag ${tag} 与 package.json 版本 ${version} 不一致"
                    }
                    echo "version=${version} tag=${tag ?: '(无 tag，跳过 Release)'}"
                }
            }
        }

        stage('Build in VM (KVM + wine)') {
            steps {
                sh 'bash /usr/local/bin/build-in-vm.sh'
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

        stage('Release') {
            when {
                expression { return env.APP_TAG?.trim() }
            }
            steps {
                withCredentials([usernamePassword(credentialsId: 'gitlab-root', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASS')]) {
                    sh '''#!/bin/bash
set -euo pipefail
API="http://127.0.0.1:8082/api/v4/projects/lbxq%2Fpentition-desktop"
TAG="$APP_TAG"
VER="${TAG#v}"
PACKAGES="http://10.175.2.11:8082/lbxq/pentition-desktop/-/packages"
DESC="PetitionDesktop ${VER}：Windows NSIS 安装包与免安装版由 Jenkins 构建，产物见包仓库 ${PACKAGES}；macOS dmg 在 mac 本机 pnpm build:mac 产出。"
AUTH="PRIVATE-TOKEN: $GIT_PASS"

body=$(cat <<JSON
{"name":"${TAG}","tag_name":"${TAG}","description":"${DESC}"}
JSON
)

code=$(curl -s -o /tmp/release.json -w '%{http_code}' -X POST "$API/releases" \
  -H "$AUTH" -H 'Content-Type: application/json' --data "$body")

if [ "$code" = "201" ]; then
  echo "GitLab Release $TAG 已创建"
elif [ "$code" = "409" ]; then
  echo "GitLab Release $TAG 已存在，更新描述"
  curl -s -o /dev/null -X PUT "$API/releases/$TAG" -H "$AUTH" \
    -H 'Content-Type: application/json' --data "$body"
else
  echo "创建 Release 失败（HTTP $code）：$(head -c 300 /tmp/release.json)"
  exit 1
fi

linkBody=$(cat <<JSON
{"name":"Windows 安装包 / 免安装版（包仓库）","url":"${PACKAGES}","link_type":"other"}
JSON
)
linkCode=$(curl -s -o /tmp/link.json -w '%{http_code}' -X POST "$API/releases/$TAG/assets/links" \
  -H "$AUTH" -H 'Content-Type: application/json' --data "$linkBody")
if [ "$linkCode" = "201" ]; then
  echo "Release 资产链接已添加"
 elif [ "$linkCode" = "409" ]; then
  echo "Release 资产链接已存在"
else
  echo "添加资产链接失败（HTTP $linkCode）：$(head -c 300 /tmp/link.json)"
  exit 1
fi
'''
                }
            }
        }
    }

    post {
        always {
            echo "Pipeline finished: ${currentBuild.currentResult}"
        }
        failure {
            echo "构建失败，查看完整日志：${env.BUILD_URL}console"
        }
    }
}
