require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'EchooLiveAudioService'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://digi02.org'
  s.license = { :type => 'MIT' }
  s.authors = { 'Digi02' => 'support@digi02.org' }
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://github.com/digi02/echoo.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MediaPlayer'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
