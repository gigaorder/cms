echo -en "\\033]0;Backoffice\\a"
THIS_DIR=$(cd -P "$(dirname "$(readlink "${BASH_SOURCE[0]}" || echo "${BASH_SOURCE[0]}")")" && pwd)
cd $THIS_DIR/../../../backoffice
PORT=`cat ../.frontend-lock`
npx vue-cli-service serve --port=$PORT