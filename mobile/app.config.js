const app = require('./app.json');

module.exports = () => {
  const isProductionBuild = process.env.NODE_ENV === 'production';
  return {
    ...app.expo,
    plugins: app.expo.plugins.map((plugin) => (
      plugin === 'expo-notifications'
        ? ['expo-notifications', { mode: isProductionBuild ? 'production' : 'development' }]
        : plugin
    )),
  };
};
