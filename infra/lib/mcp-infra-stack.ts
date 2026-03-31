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

    // -------------------------------------------------------
    // CloudWatch Dashboard - AgentCore + Lambda 모니터링
    // -------------------------------------------------------
    const gatewayArn = new cdk.CfnParameter(this, "AgentCoreGatewayArn", {
      type: "String",
      default: "",
      description: "AgentCore Gateway ARN (대시보드 메트릭 필터용, 선택)",
    });

    const dashboard = new cdk.aws_cloudwatch.Dashboard(this, "McpDashboard", {
      dashboardName: "CustomerTrends-MCP-Dashboard",
    });

    // Lambda 메트릭
    const lambdaInvocations = this.lambdaFunction.metricInvocations({ period: cdk.Duration.minutes(5) });
    const lambdaErrors = this.lambdaFunction.metricErrors({ period: cdk.Duration.minutes(5) });
    const lambdaDuration = this.lambdaFunction.metricDuration({ period: cdk.Duration.minutes(5) });
    const lambdaThrottles = this.lambdaFunction.metricThrottles({ period: cdk.Duration.minutes(5) });

    dashboard.addWidgets(
      new cdk.aws_cloudwatch.TextWidget({
        markdown: "# Customer Trends MCP Server - 모니터링 대시보드",
        width: 24,
        height: 1,
      })
    );

    // Lambda 섹션
    dashboard.addWidgets(
      new cdk.aws_cloudwatch.TextWidget({
        markdown: "## Lambda Function (Bedrock 요약/분석)",
        width: 24,
        height: 1,
      })
    );

    dashboard.addWidgets(
      new cdk.aws_cloudwatch.GraphWidget({
        title: "Lambda 호출 수 & 오류",
        left: [lambdaInvocations],
        right: [lambdaErrors],
        width: 12,
        height: 6,
      }),
      new cdk.aws_cloudwatch.GraphWidget({
        title: "Lambda 실행 시간 (ms)",
        left: [lambdaDuration],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cdk.aws_cloudwatch.GraphWidget({
        title: "Lambda 스로틀",
        left: [lambdaThrottles],
        width: 12,
        height: 6,
      }),
      new cdk.aws_cloudwatch.SingleValueWidget({
        title: "Lambda 요약",
        metrics: [lambdaInvocations, lambdaErrors, lambdaDuration],
        width: 12,
        height: 6,
      }),
    );

    // AgentCore Gateway 섹션 (Bedrock-AgentCore 네임스페이스)
    dashboard.addWidgets(
      new cdk.aws_cloudwatch.TextWidget({
        markdown: "## AgentCore Gateway\n\n메트릭은 `Bedrock-AgentCore` 네임스페이스에서 자동 발행됩니다. Gateway 배포 후 데이터가 표시됩니다.",
        width: 24,
        height: 1,
      })
    );

    const agentCoreNamespace = "Bedrock-AgentCore";

    // SEARCH 표현식으로 모든 도구 메트릭을 자동 검색
    // 도구별 Latency - MathExpression SEARCH 사용
    const latencyWidget = new cdk.aws_cloudwatch.GraphWidget({
      title: "도구별 Latency (ms)",
      width: 12,
      height: 6,
    });
    latencyWidget.addLeftMetric(new cdk.aws_cloudwatch.MathExpression({
      expression: `SEARCH('{${agentCoreNamespace}} MetricName="Latency"', 'Average', 60)`,
      label: "",
      period: cdk.Duration.minutes(1),
    }));

    const durationWidget = new cdk.aws_cloudwatch.GraphWidget({
      title: "도구별 Duration (ms)",
      width: 12,
      height: 6,
    });
    durationWidget.addLeftMetric(new cdk.aws_cloudwatch.MathExpression({
      expression: `SEARCH('{${agentCoreNamespace}} MetricName="Duration"', 'Average', 60)`,
      label: "",
      period: cdk.Duration.minutes(1),
    }));

    dashboard.addWidgets(latencyWidget, durationWidget);

    const targetExecWidget = new cdk.aws_cloudwatch.GraphWidget({
      title: "도구별 타겟 실행 시간 (ms)",
      width: 12,
      height: 6,
    });
    targetExecWidget.addLeftMetric(new cdk.aws_cloudwatch.MathExpression({
      expression: `SEARCH('{${agentCoreNamespace}} MetricName="TargetExecutionTime"', 'Average', 60)`,
      label: "",
      period: cdk.Duration.minutes(1),
    }));

    const invocationsWidget = new cdk.aws_cloudwatch.GraphWidget({
      title: "도구별 호출 수",
      width: 12,
      height: 6,
    });
    invocationsWidget.addLeftMetric(new cdk.aws_cloudwatch.MathExpression({
      expression: `SEARCH('{${agentCoreNamespace}} MetricName="Invocations"', 'Sum', 60)`,
      label: "",
      period: cdk.Duration.minutes(1),
    }));

    dashboard.addWidgets(targetExecWidget, invocationsWidget);

    // 오류/스로틀
    const errorsWidget = new cdk.aws_cloudwatch.GraphWidget({
      title: "Gateway 오류",
      width: 12,
      height: 6,
    });
    errorsWidget.addLeftMetric(new cdk.aws_cloudwatch.MathExpression({
      expression: `SEARCH('{${agentCoreNamespace}} MetricName="SystemErrors" OR MetricName="UserErrors"', 'Sum', 60)`,
      label: "",
      period: cdk.Duration.minutes(1),
    }));

    const throttlesWidget = new cdk.aws_cloudwatch.GraphWidget({
      title: "Gateway 스로틀",
      width: 12,
      height: 6,
    });
    throttlesWidget.addLeftMetric(new cdk.aws_cloudwatch.MathExpression({
      expression: `SEARCH('{${agentCoreNamespace}} MetricName="Throttles"', 'Sum', 60)`,
      label: "",
      period: cdk.Duration.minutes(1),
    }));

    dashboard.addWidgets(errorsWidget, throttlesWidget);
  }
}
