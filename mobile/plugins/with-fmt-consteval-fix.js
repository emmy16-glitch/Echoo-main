const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# Echoo: Xcode 26 fmt consteval compatibility';

module.exports = function withFmtConstevalFix(config) {
  return withPodfile(config, (config) => {
    if (config.modResults.contents.includes(MARKER)) {
      return config;
    }

    const insertion = `
${MARKER}
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |build_configuration|
        definitions = build_configuration.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
        definitions = definitions.split(' ') if definitions.is_a?(String)
        definitions << 'FMT_USE_CONSTEVAL=0' unless definitions.include?('FMT_USE_CONSTEVAL=0')
        build_configuration.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = definitions
        build_configuration.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++17'
      end
    end

    fmt_base_header = File.join(installer.sandbox.pod_dir('fmt'), 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_header)
      source = File.read(fmt_base_header)
      marker = '// Echoo: preserve the Xcode 26 fmt compatibility definition'

      unless source.include?(marker)
        source.sub!(
          "// Detect consteval, C++20 constexpr extensions and std::is_constant_evaluated.\n#if !defined(__cpp_lib_is_constant_evaluated)",
          "// Detect consteval, C++20 constexpr extensions and std::is_constant_evaluated.\n#{marker}\n#ifndef FMT_USE_CONSTEVAL\n#if !defined(__cpp_lib_is_constant_evaluated)"
        )
        source.sub!("#endif\n#if FMT_USE_CONSTEVAL", "#endif\n#endif\n#if FMT_USE_CONSTEVAL")
        File.chmod(0o644, fmt_base_header)
        File.write(fmt_base_header, source)
        File.chmod(0o444, fmt_base_header)
      end
    end

`;

    const postInstallEnd = /(^\s{2}end\nend\s*)$/m;
    if (!postInstallEnd.test(config.modResults.contents)) {
      throw new Error('Could not apply the fmt compatibility fix to the Podfile.');
    }

    config.modResults.contents = config.modResults.contents.replace(postInstallEnd, `${insertion}$1`);
    return config;
  });
};
