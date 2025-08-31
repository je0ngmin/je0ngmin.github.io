import 'dart:io';
import 'package:jinja/jinja.dart';
import 'package:markdown/markdown.dart';
import 'package:path/path.dart' as path;
import 'package:yaml/yaml.dart';
import 'copy_template.dart';

Future<void> main() async {
  await copyTemplateDirectory();

  final articleDir = Directory('articles');

  var environment = Environment(
    loader: MapLoader({
      'base.html': await File('build/base.html').readAsString(),
    }),
  );

  final templateFile = File('build/article.html');
  List<Article> articles = [];
  await for (var entity in articleDir.list(recursive: false)) {
    if (entity is Directory) {
      final newFile = File('build/${path.basename(entity.path)}.html');

      var template = environment.fromString(await templateFile.readAsString());
      var metadata = loadYaml(
        await File(path.join(entity.path, "metadata.yaml")).readAsString(),
      );
      var article = Article(
        title: metadata['title'],
        description: metadata['description'],
        url: path.basename(entity.path),
        releasedAt: DateTime.parse(metadata['released_at']),
        markdown: await File(
          path.join(entity.path, "content.md"),
        ).readAsString(),
      );
      await newFile.writeAsString(
        template.render({
          'title': article.title,
          'description': article.description,
          'released_at': article.releasedAt.toIso8601String(),
          'content': markdownToHtml(
            article.markdown,
            extensionSet: ExtensionSet.gitHubWeb,
          ),
        }),
      );
      articles.add(article);
    }
  }

  final indexTemplateFile = File('build/index.html');
  var indexTemplate = environment.fromString(
    await indexTemplateFile.readAsString(),
  );
  indexTemplateFile.writeAsString(
    indexTemplate.render({
      'articles': articles
          .map(
            (v) => {
              'title': v.title,
              'url': v.url,
              'description': v.description,
            },
          )
          .toList(),
    }),
  );

  await File("build/article.html").delete();
  await File("build/base.html").delete();

  print('복사 완료!');
}

class Article {
  String url;
  String title;
  DateTime releasedAt;
  String markdown;
  String description;

  Article({
    required this.url,
    required this.title,
    required this.releasedAt,
    required this.description,
    required this.markdown,
  });
}
