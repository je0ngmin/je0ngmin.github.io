import 'dart:io';
import 'package:path/path.dart' as path;

Future<void> copyTemplateDirectory() async {
  final buildDir = Directory('build');
  final templateDir = Directory('template');

  // build 폴더 있으면 삭제
  if (await buildDir.exists()) {
    await buildDir.delete(recursive: true);
  }
  // build 폴더 다시 생성
  await buildDir.create();
  await _copyDirectory(templateDir, buildDir);
}

Future<void> _copyDirectory(Directory source, Directory destination) async {
  await for (var entity in source.list(recursive: false)) {
    final newPath = path.join(destination.path, path.basename(entity.path));

    if (entity is Directory) {
      final newDir = Directory(newPath);
      await newDir.create();
      await _copyDirectory(entity, newDir);
    } else if (entity is File) {
      await File(newPath).writeAsBytes(await entity.readAsBytes());
    }
  }
}
