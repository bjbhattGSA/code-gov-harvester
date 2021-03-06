const _ = require("lodash");
const latinize = require("latinize");
const fieldWeights = require("./field_weights");

class Utils {

  /**
   * Transform passed string into a string to be used as an ID.
   *
   * @param {string} text
   * @returns {string} Latinized version of the supplied string.
   */
  static transformStringToKey(text) {
    return latinize(text)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s\s+/g, " ")
      .replace(/ /g, "_")
      .replace("and_", "")
      .replace("of_", "")
      .replace("the_", "");
  }

  /**
   * Flaten Elasticsearch mappings.
   * @param {object} mapping
   */
  static getFlattenedMappingProperties(mapping) {
    let props = {};

    const _recurseMappingTree = (mappingTree, pathArr) => {
      if (mappingTree["properties"]) {
        _recurseMappingTree(mappingTree["properties"], pathArr);
      } else if (mappingTree["type"]) {
        props[pathArr.join(".")] = mappingTree["type"];
      } else {
        Object.keys(mappingTree).forEach((key) => {
          _recurseMappingTree(mappingTree[key], pathArr.concat(key));
        });
      }
    };

    _recurseMappingTree(mapping, []);
    return props;
  }

  /**
   * Flaten Elasticsearch mappings by type.
   * @param {object} mapping
   */
  static getFlattenedMappingPropertiesByType(mapping) {
    let props = {};

    const _recurseMappingTree = (mappingTree, pathArr) => {
      if (mappingTree["properties"]) {
        //We need to add any nested objects for groupings.
        if (mappingTree["type"] == "nested") {
          if (!props[mappingTree["type"]]) {
            props[mappingTree["type"]] = [];
          }
          props[mappingTree["type"]].push(pathArr.join("."));
        }
        _recurseMappingTree(mappingTree["properties"], pathArr);
      } else if (mappingTree["type"]) {
        if (!props[mappingTree["type"]]) {
          props[mappingTree["type"]] = [];
        }
        props[mappingTree["type"]].push(pathArr.join("."));
      } else {
        Object.keys(mappingTree).forEach((key) => {
          _recurseMappingTree(mappingTree[key], pathArr.concat(key));
        });
      }
    };

    _recurseMappingTree(mapping, []);
    return props;
  }

  /**
   * Delete specified keys from objects in passed collection.
   * @param {Array[object]} collection - collections of objects to have keys deleted
   * @param {Array} excludeKeys - List of keys to be deleted.
   */
  static omitDeepKeys(collection, excludeKeys) {
    const omitFn = (value) => {
      if (value && typeof value === 'object') {
        excludeKeys.forEach((key) => {
          delete value[key];
        });
      }
    };
    return _.cloneDeepWith(collection, omitFn);
  }

  /**
   * Delete private object keys ( prefixed with `_` ) from objects in passed collection.
   * @param {Array[object]} collection - list of objects to have keys deleted
   */
  static omitPrivateKeys(collection) {
    const omitFn = (value) => {
      if (value && typeof value === 'object') {
        Object.keys(value).forEach((key) => {
          if (key[0] === "_") {
            delete value[key];
          }
        });
      }
    };
    return _.cloneDeepWith(collection, omitFn);
  }

  /**
   * Remove duplicate items from passed collections.
   * @param {*} collection1
   * @param {*} collection2
   */
  static removeDupes(collection1, collection2) {
    return _.filter(collection1, (obj) => {
      return !_.find(collection2, obj);
    });
  }

  /**
   * Extract schema version from code.json
   * @param {object} codeJson
   */
  static getCodeJsonVersion(codeJson) {
    if(codeJson.version) {
      return codeJson.version;
    } else {
      if(codeJson.agency && codeJson.projects) {
        return '1.0.1';
      } else if(codeJson.agency && codeJson.releases) {
        return '2.0.0';
      } else {
        return '1.0.0';
      }
    }
  }

  /**
   * Extract repositories from code.json by checking the schema version
   * @param {object} codeJson
   * @returns {array} Array with repositories / projects found in the code.json
   */
  static getCodeJsonRepos(codeJson) {
    const version = this.getCodeJsonVersion(codeJson);
    const version2RegExp = /^2(\.\d+){0,2}$/;

    if(version2RegExp.test(version)) {
      return codeJson.releases ? codeJson.releases : null;
    } else {
      return codeJson.projects ? codeJson.projects : null;
    }
  }

  static isValidEmail(email) {
    /* eslint-disable */
    let emailRegexp = new RegExp(''
      + /^(([^<>()\[\]\.,;:\s@"]+(\.[^<>()\[\]\.,;:\s@"]+)*)|(".+"))/.source
      + /@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.source);
    /* eslint-enable */

    return emailRegexp.test(email);
  }

  static isValidUrl(url) {
    const urlRegexp = new RegExp(
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/, 'g');

    return urlRegexp.test(url);
  }

  static getFieldWeight(field) {
    return fieldWeights[field] ? fieldWeights[field] : 0;
  }

  static getMaxTotalWeight() {
    let total = 0;
    Object.keys(fieldWeights).forEach(key => {
      total += fieldWeights[key];
    });
    return total;
  }

  static getScore(target, value) {
    return target.score ? target.score + value : value;
  }

  /**
   * Bunyan request serializer that prevents API tokens from leaking into the logs
   * @param {object} request - Expressjs request object
   * @returns {object} request serializer object used by Bunyan
   */
  static getLoggerRequestSerializer(request) {
    const cleanHeaders = Utils.omitDeepKeys(request.headers, ['x-api-key']);
    return {
      id: request.id,
      method: request.method,
      url: request.url,
      headers: cleanHeaders,
      remoteAddress: request.connection.remoteAddress,
      remotePort: request.connection.remotePort
    };
  }

  /**
   * Bunyan response serializer that prevents API tokens from leaking into the logs
   * @param {object} response - Expressjs response object
   * @returns {object} response serializer object used by Bunyan
   */
  static getLoggerResponseSerializer(response) {
    return {
      statusCode: response.statusCode,
      header: Utils.omitDeepKeys(response._header, ['x-api-key'])
    };
  }
  static parseGithubUrl (githubUrl) {
    if (githubUrl.match(/\/$/)) {
      githubUrl = githubUrl.replace(/\/$/, '');
    }
    if (githubUrl.match(/\.git$/)) {
      githubUrl = githubUrl.replace(/\.git$/, '');
    }
    if (githubUrl.match(/^(https:||http:)\/\/github.com\//)) {
      githubUrl = githubUrl.replace(/^(https:||http:)\/\/github.com\//, '');
    }
    if (githubUrl.match(/^git:\/\/github.com\//)) {
      githubUrl = githubUrl.replace(/^git:\/\/github.com\//, '');
    }
    if (githubUrl.match(/^git@github.com:\//)) {
      githubUrl = githubUrl.replace(/^git@github.com:\//, '');
    }
    const githubOwnerAndRepo = githubUrl.split('/');
    return {
      owner: githubOwnerAndRepo[0],
      repo: githubOwnerAndRepo[1]
    };
  }

  static isValidRepositoryUrl (repoUrl) {
    const githubUrlRegEx = /(https|http|git):\/\/(www\.)?github.com\/[^/]+\/[^/]+(.git)?$/g;
    if (repoUrl) {
      const match = repoUrl.match(githubUrlRegEx);

      if (match) {
        return true;
      }
    }

    return false;
  }

  static stripBom(input) {
    const inputString = input.toString();

    if(inputString.charCodeAt(0) === 0xFEFF) {
      return inputString.slice(1);
    }
    return inputString;
  }

  static isLastDayOfMonth(dt=null) {
    if (!dt) {
      dt = new Date();
    }
    let nextDt = new Date(dt);
    nextDt = new Date(nextDt.setDate(nextDt.getDate() + 1));
    return (dt.getMonth() !== nextDt.getMonth())
  }
}

module.exports = Utils;
