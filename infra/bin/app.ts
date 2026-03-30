#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { McpInfraStack } from "../lib/mcp-infra-stack";

const app = new cdk.App();

new McpInfraStack(app, "McpInfraStack", {
  description: "Customer Trends MCP Server - Lambda, S3, IAM resources",
});
