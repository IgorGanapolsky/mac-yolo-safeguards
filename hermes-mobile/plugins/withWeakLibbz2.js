const { withXcodeProject } = require('@expo/config-plugins');

const withWeakLibbz2 = (config) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    // Add libbz2.tbd as weak linked
    xcodeProject.addFramework('libbz2.tbd', {
      weak: true,
    });

    return config;
  });
};

module.exports = withWeakLibbz2;