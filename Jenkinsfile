pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 90, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
        disableConcurrentBuilds()
        // 让 gitlab-plugin 能把构建状态回写到 GitLab（commit status / MR 状态）
        gitLabConnection('gitlab-lab')
    }

    triggers {
        // GitLab webhook 触发：端点 http://10.175.2.11:8080/project/petition-desktop
        // secretToken 与 GitLab 侧 Webhook 的 "Secret token" 必须一致
        gitlab(triggerOnPush: true,
               triggerOnMergeRequest: true,
               branchFilterType: 'All',
               secretToken: 'petition-ci-2026')
        // 兜底：webhook 万一丢包，每 3 分钟轮询一次
        pollSCM('H/3 * * * *')
    }

    parameters {
        booleanParam(name: 'RUN_API_TEST', defaultValue: false,
                     description: '运行 Apifox 接口冒烟门禁（默认关闭；打开需要凭据 apifox-token 且套件已建好）')
        string(name: 'APIFOX_SUITE_ID', defaultValue: '', description: 'Apifox 测试套件 ID（留空则只校验 CLI 可用性）')
        string(name: 'APIFOX_PROJECT_ID', defaultValue: '', description: 'Apifox 项目 ID')
        string(name: 'APIFOX_ENV_ID', defaultValue: '', description: 'Apifox 环境 ID')
    }

    environment {
        APIFOX_IMAGE      = 'pbuild/apifox-cli:2.2.12'
        GITLAB_PROJECT_ID = '1'
        GITLAB_API        = 'http://10.175.2.11:8082/api/v4'
        GITLAB_PKG_NAME   = 'petition-desktop'
        BUILD_IMAGE       = 'pbuild:wine32'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Verify version') {
            steps {
                script {
                    def version = sh(script: "sed -n 's/^ *\"version\": *\"\\([^\"]*\\)\".*/\\1/p' package.json | head -1", returnStdout: true).trim()
                    if (!version) {
                        error 'package.json 里读不到 version'
                    }
                    def tag = sh(script: "git fetch --tags --quiet 2>/dev/null || true; git describe --tags --exact-match 2>/dev/null || true", returnStdout: true).trim()
                    env.APP_VERSION = version
                    env.APP_TAG = tag
                    if (tag && tag != "v${version}") {
                        error "tag ${tag} 与 package.json 版本 ${version} 不一致"
                    }
                    echo "version=${version} tag=${tag ?: '(无 tag，跳过 Release)'}"
                }
            }
        }

        stage('Build Windows') {
            steps {
                sh '''
                    set -eu
                    mkdir -p /srv/build/cache/electron /srv/build/cache/electron-builder
                    # 清掉上一次构建的产物，避免旧文件名（含空格）混进上传列表
                    rm -rf release
                    # Jenkins 容器内看到的 /var/jenkins_home，就是宿主 /srv/jenkins/home；
                    # docker 是宿主守护进程，卷必须用宿主路径。
                    docker run --rm \
                      -v "/srv/jenkins/home:/jn" -w "/jn/workspace/$JOB_NAME" \
                      -v /srv/build/cache/electron:/ec \
                      -v /srv/build/cache/electron-builder:/eb \
                      -e ELECTRON_CACHE=/ec \
                      -e ELECTRON_BUILDER_CACHE=/eb \
                      -e WINEDEBUG=-all \
                      -e ELECTRON_GET_USE_PROXY=1 \
                      -e GLOBAL_AGENT_HTTPS_PROXY=http://172.17.0.1:17897 \
                      -e HTTP_PROXY=http://172.17.0.1:17897 \
                      -e HTTPS_PROXY=http://172.17.0.1:17897 \
                      -e NO_PROXY=10.175.2.0/24,localhost,127.0.0.1,registry.npmmirror.com \
                      "$BUILD_IMAGE" bash -lc "pnpm install --frozen-lockfile --reporter=append-only | tail -5 && pnpm build && pnpm exec electron-builder --win nsis portable --x64 --publish never"
                '''
            }
        }

        stage('Archive') {
            steps {
                archiveArtifacts artifacts: 'release/*.exe', allowEmptyArchive: false
            }
        }

        stage('Upload to GitLab') {
            steps {
                withCredentials([string(credentialsId: 'gitlab-token', variable: 'GITLAB_TOKEN')]) {
                    sh '''
                        set -eu
                        for f in release/*.exe; do
                          name=$(basename "$f")
                          # 文件名里的空格必须编码，否则 curl 会当成非法 URL（HTTP 000）
                          encoded=$(printf '%s' "$name" | sed 's/ /%20/g')
                          url="$GITLAB_API/projects/$GITLAB_PROJECT_ID/packages/generic/$GITLAB_PKG_NAME/$APP_VERSION/$encoded"
                          code=$(curl -s -o /tmp/upload.log -w '%{http_code}' --upload-file "$f" \
                                 -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$url")
                          echo "upload $name => HTTP $code"
                          [ "$code" = "201" ] || { cat /tmp/upload.log; exit 1; }
                        done
                    '''
                }
            }
        }

        stage('Release') {
            when {
                expression { return env.APP_TAG?.trim() }
            }
            steps {
                withCredentials([string(credentialsId: 'gitlab-token', variable: 'GITLAB_TOKEN')]) {
                    sh '''
                        set -eu
                        TAG="$APP_TAG"
                        VER="${TAG#v}"
                        PKG="http://10.175.2.11:8082/lbxq/petition-desktop/-/packages"
                        # 资产链接必须指向 API 通用包直链：UI 路径 /-/packages/... 对匿名用户会 302 到登录页
                        DL="http://10.175.2.11:8082/api/v4/projects/$GITLAB_PROJECT_ID/packages/generic/$GITLAB_PKG_NAME/$VER"
                        DESC="PetitionDesktop ${VER}：Windows 安装包与免安装版由 Jenkins 构建（wine 交叉编译），产物见包仓库 ${PKG}。"
                        BODY=$(printf '{"name":"%s","tag_name":"%s","description":"%s"}' "$TAG" "$TAG" "$DESC")

                        code=$(curl -s -o /tmp/rel.json -w '%{http_code}' -X POST "$GITLAB_API/projects/$GITLAB_PROJECT_ID/releases" \
                              -H "PRIVATE-TOKEN: $GITLAB_TOKEN" -H 'Content-Type: application/json' --data "$BODY")
                        if [ "$code" = "201" ]; then
                          echo "Release $TAG 已创建"
                        elif [ "$code" = "409" ]; then
                          curl -s -o /dev/null -X PUT "$GITLAB_API/projects/$GITLAB_PROJECT_ID/releases/$TAG" \
                            -H "PRIVATE-TOKEN: $GITLAB_TOKEN" -H 'Content-Type: application/json' --data "$BODY"
                          echo "Release $TAG 已存在，已更新"
                        else
                          echo "创建 Release 失败 HTTP $code"; cat /tmp/rel.json; exit 1
                        fi

                        for kind in Setup portable; do
                          if [ "$kind" = "Setup" ]; then
                            fname="PetitionDesktop-Setup-$VER.exe"
                          else
                            fname="PetitionDesktop-$VER-portable.exe"
                          fi
                          ename=$(printf '%s' "$fname" | sed 's/ /%20/g')
                          url="$DL"
                          LINK=$(printf '{"name":"%s","url":"%s/$GITLAB_PKG_NAME/%s/%s","link_type":"package"}' "$fname" "$url" "$VER" "$ename")
                          lcode=$(curl -s -o /tmp/link.json -w '%{http_code}' -X POST "$GITLAB_API/projects/$GITLAB_PROJECT_ID/releases/$TAG/assets/links" \
                                -H "PRIVATE-TOKEN: $GITLAB_TOKEN" -H 'Content-Type: application/json' --data "$LINK")
                          if [ "$lcode" = "201" ] || [ "$lcode" = "409" ]; then
                            echo "Release 资产链接 $fname => HTTP $lcode"
                          else
                            echo "添加资产链接失败 $fname HTTP $lcode"; cat /tmp/link.json
                          fi
                        done
'''
                }
            }
        }

        // 接口冒烟门禁：默认关闭（parameters.RUN_API_TEST=false 时整段跳过，不影响 P0 绿线）
        // 打开后即使失败也只把构建标记为 UNSTABLE，不阻断打包产物的产出
        stage('API 冒烟门禁') {
            when {
                expression { return params.RUN_API_TEST }
            }
            steps {
                catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                    script {
                        def suiteId   = params.APIFOX_SUITE_ID?.trim()
                        def projectId = params.APIFOX_PROJECT_ID?.trim()
                        def envId     = params.APIFOX_ENV_ID?.trim()

                        if (!suiteId) {
                            // 最小验证模式：不连 Apifox，只确认镜像里的 CLI 可用
                            echo 'APIFOX_SUITE_ID 为空 → 最小验证模式（仅校验 CLI 版本）'
                            sh 'docker run --rm "$APIFOX_IMAGE" apifox --version'
                        } else {
                            withCredentials([string(credentialsId: 'apifox-token', variable: 'APIFOX_TOKEN')]) {
                                withEnv([
                                    "SUITE_ID=${suiteId}",
                                    "PROJECT_ID=${projectId}",
                                    "ENVIRONMENT_ID=${envId}"
                                ]) {
                                    sh '''
                                        set -eu
                                        mkdir -p "$WORKSPACE/test-reports"
                                        docker run --rm \
                                          -e APIFOX_TOKEN \
                                          -e SUITE_ID -e PROJECT_ID -e ENVIRONMENT_ID \
                                          -v "$WORKSPACE/test-reports:/reports" \
                                          "$APIFOX_IMAGE" bash -lc '
                                            apifox login --with-token "$APIFOX_TOKEN" &&
                                            apifox test-suite run "$SUITE_ID" \
                                              --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" \
                                              --reporters cli,json,junit \
                                              --out-dir /reports --upload-report
                                          '
                                    '''
                                }
                            }
                        }
                    }
                }
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'test-reports/*.xml'
                }
            }
        }
    }

    post {
        always {
            echo "Pipeline finished: ${currentBuild.currentResult}"
        }
        failure {
            echo "构建失败，完整日志：${env.BUILD_URL}console"
        }
    }
}
