/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {normalize} from '@angular-devkit/core';
import {WorkspaceProject, WorkspaceSchema} from '@angular-devkit/core/src/workspace';
import {SchematicsException, Tree} from '@angular-devkit/schematics';
import {
  getProjectFromWorkspace,
  getProjectStyleFile,
  getProjectTargetOptions,
} from '@angular/cdk/schematics';
import {InsertChange} from '@schematics/angular/utility/change';
import {getWorkspace} from '@schematics/angular/utility/config';
import {join} from 'path';
import {Schema} from '../schema';
import {createCustomTheme} from './custom-theme';


/** Add pre-built styles to the main project style file. */
export function addThemeToAppStyles(options: Schema): (host: Tree) => Tree {
  return function(host: Tree): Tree {
    const workspace = getWorkspace(host);
    const project = getProjectFromWorkspace(workspace, options.project);
    const themeName = options.theme || 'indigo-pink';

    // Because the build setup for the Angular CLI can be changed so dramatically, we can't know
    // where to generate anything if the project is not using the default config for build and test.
    assertDefaultBuildersConfigured(project);

    if (themeName === 'custom') {
      insertCustomTheme(project, options.project, host, workspace);
    } else {
      insertPrebuiltTheme(project, host, themeName, workspace);
    }

    return host;
  };
}

/**
 * Insert a custom theme to project style file. If no valid style file could be found, a new
 * Scss file for the custom theme will be created.
 */
function insertCustomTheme(project: WorkspaceProject, projectName: string, host: Tree,
                           workspace: WorkspaceSchema) {

  const stylesPath = getProjectStyleFile(project, 'scss');
  const themeContent = createCustomTheme(projectName);

  if (!stylesPath) {
    if (!project.sourceRoot) {
      throw new Error(`Could not find source root for project: "${projectName}". Please make ` +
        `sure that the "sourceRoot" property is set in the workspace config.`);
    }

    // Normalize the path through the devkit utilities because we want to avoid having
    // unnecessary path segments and windows backslash delimiters.
    const customThemePath = normalize(join(project.sourceRoot, 'custom-theme.scss'));

    host.create(customThemePath, themeContent);

    return addStyleToTarget(project, 'build', host, customThemePath, workspace);
  }

  const insertion = new InsertChange(stylesPath, 0, themeContent);
  const recorder = host.beginUpdate(stylesPath);

  recorder.insertLeft(insertion.pos, insertion.toAdd);
  host.commitUpdate(recorder);
}

/** Insert a pre-built theme into the angular.json file. */
function insertPrebuiltTheme(project: WorkspaceProject, host: Tree, theme: string,
                             workspace: WorkspaceSchema) {

  // Path needs to be always relative to the `package.json` or workspace root.
  const themePath =  `./node_modules/@angular/material/prebuilt-themes/${theme}.css`;

  addStyleToTarget(project, 'build', host, themePath, workspace);
  addStyleToTarget(project, 'test', host, themePath, workspace);
}

/** Adds a style entry to the given project target. */
function addStyleToTarget(project: WorkspaceProject, targetName: string, host: Tree,
                          assetPath: string, workspace: WorkspaceSchema) {
  const targetOptions = getProjectTargetOptions(project, targetName);

  if (!targetOptions.styles) {
    targetOptions.styles = [assetPath];
  } else {
    const existingStyles = targetOptions.styles.map(s => typeof s === 'string' ? s : s.input);
    const hasGivenTheme = existingStyles.find(s => s.includes(assetPath));
    const hasOtherTheme = existingStyles.find(s => s.includes('material/prebuilt'));

    if (!hasGivenTheme && !hasOtherTheme) {
      targetOptions.styles.unshift(assetPath);
    }
  }

  host.overwrite('angular.json', JSON.stringify(workspace, null, 2));
}

/** Throws if the project is not using the default Angular devkit builders. */
function assertDefaultBuildersConfigured(project: WorkspaceProject) {
  checkProjectTargetBuilder(project, 'build', '@angular-devkit/build-angular:browser');
  checkProjectTargetBuilder(project, 'test', '@angular-devkit/build-angular:karma');
}

/**
 * Checks if the specified project target is configured with the default builders which are
 * provided by the Angular CLI.
 */
function checkProjectTargetBuilder(project: WorkspaceProject, targetName: string,
                            defaultBuilder: string) {

  const targetConfig = project.architect && project.architect[targetName] ||
                       project.targets && project.targets[targetName];

  if (!targetConfig || targetConfig['builder'] !== defaultBuilder) {
    throw new SchematicsException(
      `Your project is not using the default builders for "${targetName}". The Angular Material ` +
      'schematics can only be used if the original builders from the Angular CLI are configured.');
  }
}
