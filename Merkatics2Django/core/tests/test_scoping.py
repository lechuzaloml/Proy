import uuid

from django.db import IntegrityError, models, transaction
from django.http import Http404
from django.test import TestCase

from core.models import WorkspaceScopedModel
from core.scoping import workspace_object_or_404


class TestWorkspace(models.Model):
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    class Meta:
        app_label = "core"


class TestScopedRecord(WorkspaceScopedModel):
    workspace = models.ForeignKey(TestWorkspace, on_delete=models.CASCADE)
    value = models.CharField(max_length=32)

    class Meta:
        app_label = "core"


class WorkspaceScopingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.workspace_a = TestWorkspace.objects.create()
        cls.workspace_b = TestWorkspace.objects.create()
        cls.record_a = TestScopedRecord.objects.para(cls.workspace_a).create(
            workspace=cls.workspace_a,
            value="a",
        )
        cls.record_b = TestScopedRecord.objects.para(cls.workspace_b).create(
            workspace=cls.workspace_b,
            value="b",
        )

    def test_scoped_manager_never_returns_other_workspace(self):
        records = list(TestScopedRecord.objects.para(self.workspace_a))
        self.assertEqual(records, [self.record_a])
        self.assertNotIn(self.record_b, records)

    def test_unscoped_manager_requires_explicit_method(self):
        with self.assertRaises(RuntimeError):
            TestScopedRecord.objects.all()

    def test_scoped_manager_rejects_writes_to_other_workspace(self):
        with self.assertRaises(ValueError):
            TestScopedRecord.objects.para(self.workspace_a).create(
                workspace=self.workspace_b,
                value="wrong workspace",
            )

    def test_foreign_workspace_uid_returns_404(self):
        with self.assertRaises(Http404):
            workspace_object_or_404(
                TestScopedRecord, self.record_b.uid, self.workspace_a
            )

    def test_uid_is_uuid4_unique_and_not_editable(self):
        field = TestScopedRecord._meta.get_field("uid")
        self.assertTrue(field.unique)
        self.assertFalse(field.editable)
        self.assertEqual(self.record_a.uid.version, 4)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TestScopedRecord.objects.para(self.workspace_a).create(
                    workspace=self.workspace_a,
                    uid=self.record_a.uid,
                    value="duplicate",
                )
