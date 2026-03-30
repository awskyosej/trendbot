import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

/**
 * MCP Infrastructure Stack
 *
 * Defines all resources for the Customer Trends MCP server:
 * - Lambda Function (NodejsFunction with esbuild bundling)
 * - S3 Bucket for news article storage
 * - IAM permissions for Bedrock and AgentCore
 * - Lambda Function URL
 */
export class McpInfraStack extends cdk.Stack {
  public readonly lambdaFunction: nodejs.NodejsFunction;
  public readonly newsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------
    // S3 Bucket: news article storage (Task 13.1)
    // -------------------------------------------------------
    this.newsBucket = new s3.Bucket(this, "McpNewsArticlesBucket", {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
          id: "auto-delete-90-days",
        },
      ],
    });

    // -------------------------------------------------------
    // Lambda Function (Task 12.1)
    // -------------------------------------------------------
    this.lambdaFunction = new nodejs.NodejsFunction(this, "McpLambdaFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../src/handlers/lambda.ts"),
      handler: "handler",
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      environment: {
        S3_BUCKET_NAME: this.newsBucket.bucketName,
        BEDROCK_REGION: "us-east-1",
        AGENTCORE_ENDPOINT: "",
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        externalModules: ["@aws-sdk/*"],
        forceDockerBundling: false,
        // CloudShell(ARM64)에서 esbuild 바이너리 호환 문제 방지:
        // npm install 시 올바른 아키텍처의 esbuild가 설치되도록
        // 프로젝트 루트의 node_modules 대신 글로벌 또는 로컬 설치를 사용
        esbuildArgs: {},
      },
    });

    // -------------------------------------------------------
    // S3 permissions for Lambda (Task 13.2)
    // -------------------------------------------------------
    this.newsBucket.grantReadWrite(this.lambdaFunction);

    // -------------------------------------------------------
    // Bedrock InvokeModel permission (Task 14.1)
    // -------------------------------------------------------
    this.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
        ],
      })
    );

    // -------------------------------------------------------
    // AgentCore InvokeAgent permission (Task 14.2)
    // -------------------------------------------------------
    this.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeAgent"],
        resources: ["*"],
      })
    );

    // -------------------------------------------------------
    // Lambda Function URL (Task 12.2)
    // -------------------------------------------------------
    const functionUrl = this.lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    new cdk.CfnOutput(this, "McpLambdaFunctionUrl", {
      value: functionUrl.url,
      description: "Lambda Function URL for MCP server (use for Kiro IDE MCP registration)",
    });
  }
}
