#!/bin/bash -ex

echo Installing dependencies...

npm install
# Using npm until build issues resolved with yarn
# yarn install --ignore-engines --ignore-scripts

echo Finished installing dependencies
